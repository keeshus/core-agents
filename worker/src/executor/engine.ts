import type {
  FlowDefinition,
  FlowNode,
  FlowEdge,
  SSEEvent,
  ExecutionStep,
  NodeData,
  BranchNodeData,
} from 'core-agents-shared';
import { topologicalSort } from './dag.js';
import { callLLM, type ResolvedEndpoint } from '../providers/index.js';
import { randomUUID } from 'node:crypto';

const slugify = (s: string) => s.toLowerCase().replace(/[\s.]+/g, '_');

export class HitlPauseError extends Error {
  public nodeId: string;
  public savedOutputs: Record<string, unknown>;
  public buttons: Array<{ label: string; value: string; icon?: string }>;
  public prompt: string;
  public assignmentType?: string;
  public assignees?: { userIds: string[]; roleIds: string[] };
  public requiredApprovals?: number;
  constructor(nodeId: string, savedOutputs: Record<string, unknown>, buttons?: Array<{ label: string; value: string; icon?: string }>, prompt?: string, assignmentType?: string, assignees?: { userIds: string[]; roleIds: string[] }, requiredApprovals?: number) {
    super(`HITL: waiting for human input at node ${nodeId}`);
    this.name = 'HitlPauseError';
    this.nodeId = nodeId;
    this.savedOutputs = savedOutputs;
    this.buttons = buttons || [{ label: 'Approve', value: 'approved', icon: 'check_circle' }, { label: 'Reject', value: 'rejected', icon: 'cancel' }];
    this.prompt = prompt || '';
    this.assignmentType = assignmentType;
    this.assignees = assignees;
    this.requiredApprovals = requiredApprovals;
  }
}

export class FlowStopError extends Error {
  public nodeId: string;
  public status: string;
  constructor(nodeId: string, message?: string, status?: string) {
    super(message || 'Execution stopped');
    this.name = 'FlowStopError';
    this.nodeId = nodeId;
    this.status = status || 'cancelled';
  }
}

export type EventCallback = (nodeId: string, event: SSEEvent) => void | Promise<void>;

// Database lookups the executor needs at runtime
export interface ExecutionContext {
  getEndpoint?: (endpointId: string) => Promise<ResolvedEndpoint | null>;
  getMCPServer?: (serverId: string) => Promise<any>;
  getEmbeddingProvider?: (providerId: string) => Promise<{ providerType: string; apiKey: string; baseUrl: string | null; model: string } | null>;
  getVectorStore?: (storeId: string) => Promise<{ name: string; url: string; apiKey: string | null } | null>;
  searchSimilar?: (collectionName: string, queryEmbedding: number[], topK: number, minScore: number) => Promise<Array<{ documentId: string; chunkText: string; chunkIndex: number; similarity: number }>>;
  flowNodes?: Array<{ id: string; type: string; data: any }>;
  flowEdges?: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>;
}

export class FlowExecutor {
  private abortController: AbortController;
  private currentRunId = '';

  constructor() {
    this.abortController = new AbortController();
  }

  abort() {
    this.abortController.abort();
  }

  async execute(
    flow: FlowDefinition,
    input: Record<string, unknown>,
    onEvent: EventCallback,
    context: ExecutionContext,
    options?: { replayFrom?: string; replayOutputs?: Record<string, unknown>; inputOverride?: Record<string, unknown>; initialIteration?: number },
  ): Promise<{ output: Record<string, unknown>; steps: ExecutionStep[] }> {
    const runId = randomUUID();
    this.currentRunId = runId;
    const { sorted, cycles } = topologicalSort(flow.nodes, flow.edges);

    if (cycles.length > 0) {
      console.warn(`Flow contains feedback loops (cycles): ${JSON.stringify(cycles)}`);
    }

    // Validate the flow before execution — catch schema/template issues early
    // Skip validation when there are cycles (feedback loops) — cycle ordering is undefined
    const validationErrors = cycles.length > 0 ? [] : this.compileFlow(sorted, flow.edges, input);
    if (validationErrors.length > 0) {
      throw new Error(`Flow compilation failed:\n${validationErrors.join('\n')}`);
    }

    const nodeOutputs = new Map<string, unknown>();
    nodeOutputs.set('__input__', options?.inputOverride || input);

    // If replaying: pre-load saved outputs from previous run, skip nodes before HITL
    const replayFrom = options?.replayFrom;
    const replayOutputs = options?.replayOutputs || {};
    let beforeHitl = !!replayFrom;

    const steps: ExecutionStep[] = [];

    const currentIteration = options?.initialIteration ?? 0;
    let feedbackLoopCount = 0;
    const MAX_FEEDBACK_ITERS = 10;

    for (let i = 0; i < sorted.length; i++) {
      const node = sorted[i];
      if (this.abortController.signal.aborted) break;

      // Skip nodes before the HITL node when replaying
      if (beforeHitl) {
        if (node.id === replayFrom) {
          beforeHitl = false;
        } else if (replayOutputs[node.id] !== undefined) {
          nodeOutputs.set(node.id, replayOutputs[node.id]);
          const labelKey = slugify(node.data.label || node.id);
          nodeOutputs.set(labelKey, replayOutputs[node.id]);
          continue; // skip already-completed nodes
        }
      }

      // Skip MCP Tool / Retriever nodes — they only run when called by an LLM Agent
      if (node.data.type === 'mcp-tool' || node.data.type === 'retriever') {
        // Only skip if this node is connected to an LLM Agent's tool-input
        const outgoingEdges = flow.edges.filter(e => e.source === node.id);
        const isToolProvider = outgoingEdges.some(e => e.sourceHandle === 'tool-output' || e.targetHandle?.startsWith('tool-input'));
        if (isToolProvider) {
          nodeOutputs.set(node.id, { note: 'called by LLM Agent' });
          continue;
        }
      }

      // Check if this node should be skipped based on incoming edge conditions or sourceHandle
      const incomingEdges = flow.edges.filter(e => e.target === node.id);
      if (incomingEdges.length > 0) {
        const sourceOutputs = incomingEdges.map(e => {
          // Try by node ID first, then by label — outputs are stored under label key
          const byId = nodeOutputs.get(e.source);
          if (byId !== undefined) return byId;
          const srcNode = flow.nodes.find(n => n.id === e.source);
          if (srcNode) {
            const labelKey = slugify(srcNode.data?.label || srcNode.id);
            return nodeOutputs.get(labelKey);
          }
          return undefined;
        });
        const allFiltered = incomingEdges.every((e, i) => {
          const src = sourceOutputs[i] as Record<string, unknown> | undefined;

          // Propagate skipped status: if the source node was skipped, skip downstream nodes too
          if ((src as any)?.skipped === true) {
            return true;
          }

          // Check explicit edge condition (branch nodes, HITL edges with conditions)
          if (e.condition?.label) {
            const routeLabel = (src as any)?.label ?? (src as any)?.decision;
            if (routeLabel !== e.condition.label) return true;
          }

          // For branch/HITL sources without explicit conditions, filter by sourceHandle
          // Branch nodes route by comparing the matched label against outputLabels[index].
          // HITL nodes have dynamic output handles per button — if the decision
          // doesn't match the button at the sourceHandle index, filter this edge.
          if (!e.condition?.label && e.sourceHandle) {
            const sourceNode = flow.nodes.find(n => n.id === e.source);
            if (sourceNode && (sourceNode.data as any)?.type === 'branch') {
              const labels: string[] = (sourceNode.data as any).config?.outputLabels || [];
              const handleIndex = parseInt((e.sourceHandle as string).replace('output-', ''), 10);
              const matchedLabel = (src as any)?.label;
              if (matchedLabel) {
                if (labels[handleIndex]?.toLowerCase() === matchedLabel.toLowerCase()) {
                  return false;
                }
                return true;
              }
              // No matched label — fall back to truthy/falsy routing
              const verdict = (src as any)?.verdict;
              if (handleIndex === 0) return !verdict;
              if (handleIndex === 1) return !!verdict;
            }
            if (sourceNode && (sourceNode.data as any)?.type === 'hitl') {
              const buttons: Array<{ value: string }> = (sourceNode.data as any).config?.buttons || [];
              const handleIndex = parseInt((e.sourceHandle as string).replace('output-', ''), 10);
              const decision = (src as any)?.decision;
              // Max iterations exit handle (index >= buttons.length): only follow if max iterations reached
              if (handleIndex >= buttons.length) {
                if (decision !== 'max_iterations') return true;
              } else {
                const buttonValue = buttons[handleIndex]?.value;
                if (buttonValue && decision && buttonValue !== decision) return true;
              }
            }
          }

          return false;
        });

        if (allFiltered) {
          // Propagated skip: upstream node was skipped, so skip this one too
          if (incomingEdges.some((e, i) => (sourceOutputs[i] as any)?.skipped === true)) {
            nodeOutputs.set(node.id, { skipped: true, reason: 'Upstream skipped' });
            onEvent(node.id, {
              type: 'step.skipped',
              executionId: '',
              nodeId: node.id,
              data: { nodeId: node.id, nodeType: node.data.type, nodeLabel: node.data.label || node.data.type, reason: 'Upstream skipped', iteration: currentIteration },
              timestamp: new Date().toISOString(),
            });
            continue;
          }
          if (incomingEdges.some(e => e.condition?.label || e.sourceHandle)) {
            // Check if an upstream branch node has a default path configured
            const defaultEdge = incomingEdges.find(e => {
              if (!e.sourceHandle) return false;
              const sNode = flow.nodes.find(n => n.id === e.source);
              if (!sNode || (sNode.data as any)?.type !== 'branch') return false;
              const cfg = (sNode.data as any).config || {};
              if (!cfg.defaultPath) return false;
              const labels: string[] = cfg.outputLabels || [];
              const handleIdx = parseInt(e.sourceHandle.replace('output-', ''), 10);
              return labels[handleIdx] === cfg.defaultPath;
            });
            if (defaultEdge) {
              // Default path matched — continue processing instead of skipping
            } else {
              nodeOutputs.set(node.id, { skipped: true, reason: 'No matching route' });
              onEvent(node.id, {
                type: 'step.skipped',
                executionId: '',
                nodeId: node.id,
                data: { nodeId: node.id, nodeType: node.data.type, nodeLabel: node.data.label || node.data.type, reason: 'No matching route', iteration: currentIteration },
                timestamp: new Date().toISOString(),
              });
              continue;
            }
          }
          // All edges have no conditions/sourceHandles — misconfigured flow
          throw new Error(
            `Node "${node.data.label || node.id}" has ${incomingEdges.length} incoming edges from a branch/HITL node, but none have routing conditions set. ` +
            `Connect each edge to a specific output handle on the source node.`
          );
        }
      }

      const stepInput = this.prepareInput(node, flow.edges, nodeOutputs);

      // If node is output type and has inputFields set, filter stepInput to only those fields
      // Non-output nodes always receive all data — templates give full control over what's used
      const nodeConfig = (node.data as any)?.config || {};
      const inputFields = nodeConfig.inputFields as string[] | undefined;
      const filteredInput = (node.data.type === 'output') && inputFields && inputFields.length > 0 && stepInput && typeof stepInput === 'object'
        ? (() => {
            const result: Record<string, unknown> = {};
            const input = stepInput as Record<string, unknown>;
            for (const path of inputFields) {
              const dot = path.indexOf('.');
              if (dot === -1) {
                // Whole label: slugify to match stored output keys
                const slugKey = slugify(path);
                if (input[slugKey] !== undefined) result[slugKey] = input[slugKey];
              } else {
                // Dot-path: slugify the label part
                const rawLabel = path.slice(0, dot);
                const field = path.slice(dot + 1);
                const slugLabel = slugify(rawLabel);
                const labelData = input[slugLabel] as Record<string, unknown> | undefined;
                if (labelData && field in labelData) {
                  if (!result[slugLabel]) result[slugLabel] = {};
                  (result[slugLabel] as Record<string, unknown>)[field] = labelData[field];
                }
              }
            }
            return result;
          })()
        : stepInput;

      // Enrich step input with node config for debugging (LLM prompt, model, etc.)
      const enrichedInput: Record<string, unknown> = {
        ...(filteredInput as Record<string, unknown> || {}),
        _nodeType: node.data.type,
        _nodeLabel: node.data.label || node.data.type,
        _rawInput: filteredInput !== stepInput ? stepInput : undefined,
      };
      if (node.data.type === 'llm-agent') {
        const cfg = (node.data as any).config || {};
        if (cfg.systemPrompt) enrichedInput.systemPrompt = cfg.systemPrompt;
        if (cfg.model) enrichedInput.model = cfg.model;
        if (cfg.temperature !== undefined) enrichedInput.temperature = cfg.temperature;
      }
      if (node.data.type === 'branch') {
        const cfg = (node.data as any).config || {};
        if (cfg.condition) enrichedInput.condition = cfg.condition;
      }

      await onEvent(node.id, {
        type: 'step.started',
        executionId: '',
        nodeId: node.id,
        data: { nodeId: node.id, nodeType: node.data.type, nodeLabel: node.data.label || node.data.type, input: enrichedInput, iteration: currentIteration },
        timestamp: new Date().toISOString(),
      });

      try {
        // For HITL replay: separate what was displayed vs what gets forwarded
        let nodeInput = filteredInput;
        if ((node.data as any).type === 'hitl' && replayFrom && node.id === replayFrom) {
          const cfg = (node.data as any)?.config || {};
          const displayFields: string[] = cfg.displayFields || [];
          const forwardFields: string[] = cfg.forwardFields || [];
          const raw = stepInput as Record<string, unknown> | undefined || {};
          const displayed: Record<string, unknown> = {};
          const forwarded: Record<string, unknown> = {};
          if (displayFields.length > 0) {
            for (const f of displayFields) { if (raw[f] !== undefined) displayed[f] = raw[f]; }
          } else { Object.assign(displayed, raw); }
          if (forwardFields.length > 0) {
            for (const f of forwardFields) { if (raw[f] !== undefined) forwarded[f] = raw[f]; }
          } else { Object.assign(forwarded, raw); }
          // Store displayed for UI, pass forwarded to next node
          nodeInput = { ...(filteredInput as any), _reviewedContent: forwarded };
        }
        const output = await this.executeNode(node, nodeInput, context, onEvent);
        // Strip internal metadata from downstream output — only actual content flows between nodes
        const cleanOutput = output && typeof output === 'object' && !Array.isArray(output)
          ? Object.fromEntries(
              Object.entries(output as Record<string, unknown>).filter(
                ([k]) => !k.startsWith('_') && k !== 'toolCalls' && k !== '_reviewedContent'
              )
            )
          : output;
        const outputKey = slugify(node.data.label || node.id);
        nodeOutputs.set(outputKey, cleanOutput);
        nodeOutputs.set(node.id, cleanOutput);

        await onEvent(node.id, {
          type: 'step.completed',
          executionId: '',
          nodeId: node.id,
          data: { nodeId: node.id, nodeType: node.data.type, nodeLabel: node.data.label, output: output as Record<string, unknown>, iteration: currentIteration },
          timestamp: new Date().toISOString(),
        });

        steps.push({
          id: '',
          executionId: '',
          nodeId: node.id,
          nodeType: node.data.type,
          status: 'completed',
          input: stepInput as Record<string, unknown>,
          output: output as Record<string, unknown>,
          error: null,
          startedAt: null,
          completedAt: null,
        });

        // ── Feedback loop detection ──────────────────────────────────────────
        if ((node.data as any)?.type === 'hitl') {
          const hitlOutput = output as Record<string, unknown> | undefined;
          const decision = hitlOutput?.decision as string | undefined;
          if (decision) {
            const hitlConfig = (node.data as any)?.config || {};
            const buttons: Array<{ value: string }> = hitlConfig.buttons || [];
            for (const edge of flow.edges.filter(e => e.source === node.id)) {
              const handleIdx = parseInt((edge.sourceHandle || 'output-0').replace('output-', ''), 10);
              const buttonValue = buttons[handleIdx]?.value;
              const targetIdx = sorted.findIndex(n => n.id === edge.target);

              if (targetIdx >= 0 && targetIdx < i) {
                if (decision === buttonValue) {
                  // This is a feedback edge — re-execute from target
                  const isMaxIter = hitlConfig.maxIterations > 0 && (feedbackLoopCount + 1) >= hitlConfig.maxIterations;
                  if (isMaxIter) {
                    nodeOutputs.set(node.id, { decision: 'max_iterations', feedback: hitlOutput?.feedback || '', _iterationCount: currentIteration });
                    nodeOutputs.set(slugify(node.data?.label || node.id), { decision: 'max_iterations', feedback: hitlOutput?.feedback || '', _iterationCount: currentIteration });
                    break;
                  }

                  feedbackLoopCount++;
                  if (feedbackLoopCount >= MAX_FEEDBACK_ITERS) break;

                  for (let r = targetIdx; r < i; r++) {
                    const resetNode = sorted[r];
                    nodeOutputs.delete(resetNode.id);
                    nodeOutputs.delete(slugify(resetNode.data?.label || resetNode.id));
                  }

                  const flowInput = nodeOutputs.get('__input__') as Record<string, unknown> || {};
                  const prevFeedback = hitlOutput?.feedback || '';
                  delete flowInput._approved;
                  delete flowInput._decision;
                  delete flowInput._feedback;

                  flowInput._iterationCount = currentIteration;
                  flowInput._feedback = prevFeedback;
                  nodeOutputs.set('_lastFeedback', prevFeedback);

                  i = targetIdx - 1;
                  break;
                }
              }
            }
          }
        }
      } catch (err) {
        // If HITL node paused, populate saved outputs before re-throwing
        if (err instanceof HitlPauseError) {
          const saved: Record<string, unknown> = {};
          for (const [k, v] of nodeOutputs) {
            if (k !== '__input__' && flow.nodes.some(n => n.id === k)) saved[k] = v;
          }
          const hitlConfig = (node.data as any)?.config || {};
          throw new HitlPauseError(err.nodeId, saved, hitlConfig.buttons, err.prompt);
        }
        const error = err instanceof Error ? err.message : String(err);
        await onEvent(node.id, {
          type: 'step.failed',
          executionId: '',
          nodeId: node.id,
          data: { nodeId: node.id, nodeType: node.data.type, nodeLabel: node.data.label, error, iteration: currentIteration },
          timestamp: new Date().toISOString(),
        });

        steps.push({
          id: '',
          executionId: '',
          nodeId: node.id,
          nodeType: node.data.type,
          status: 'failed',
          input: stepInput as Record<string, unknown>,
          output: null,
          error,
          startedAt: null,
          completedAt: null,
        });
        throw err; // Stop execution on failure
      }
    }

    // Deduplicate: only include ID-keyed entries (labels are secondary keys)
    const nodeIds = new Set(flow.nodes.map(n => n.id));
    const uniqueOutput = Object.fromEntries(
      [...nodeOutputs].filter(([k]) => k === '__input__' || nodeIds.has(k))
    );
    return { output: uniqueOutput, steps };
  }

  private compileFlow(sorted: FlowNode[], edges: FlowEdge[], flowInput?: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const computeSlug = (n: FlowNode) => slugify(n.data?.label || n.id);

    for (let i = 0; i < sorted.length; i++) {
      const node = sorted[i];
      const config = (node.data as any)?.config || {};

      // Collect upstream slugs (nodes before this one in topological order)
      const upstreamSlugs = new Set<string>();
      for (let j = 0; j < i; j++) {
        upstreamSlugs.add(computeSlug(sorted[j]));
      }

      // Validate inputFields: check that path references an upstream slug OR a flow input key
      // Only relevant for output nodes — other nodes pass all data through
      const inputFields: string[] = node.data.type === 'output' ? (config.inputFields || []) : [];
      for (const field of inputFields) {
        const dot = field.indexOf('.');
        const rawLabel = dot === -1 ? field : field.slice(0, dot);
        const slugLabel = slugify(rawLabel);
        const isUpstreamNode = upstreamSlugs.has(slugLabel);
        const isFlowInputKey = flowInput ? rawLabel in flowInput : false;
        if (!isUpstreamNode && !isFlowInputKey && slugLabel !== '__input__') {
          errors.push(`Node "${node.data?.label || node.id}": input field "${field}" references "${rawLabel}" which is not an upstream node nor a flow input key. Available upstream: ${Array.from(upstreamSlugs).join(', ') || '(none)'}`);
        }
      }

      // Validate template variables in code/condition/systemPrompt
      const templates: string[] = [];
      if (config.code) templates.push(config.code);
      if (config.condition) templates.push(config.condition);
      if (config.systemPrompt) templates.push(config.systemPrompt);
      for (const tpl of templates) {
        const regex = /\{\{input\.([^}]+)\}\}/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(tpl)) !== null) {
          const path = match[1].trim();
          const label = path.split('.')[0];
          const slugLabel = slugify(label);
          const isUpstreamNode = upstreamSlugs.has(slugLabel);
          const isFlowInputKey = flowInput ? label in flowInput : false;
          if (!isUpstreamNode && !isFlowInputKey && slugLabel !== '__input__') {
            errors.push(`Node "${node.data?.label || node.id}": template "{{input.${path}}}" references "${label}" which is not an upstream node nor a flow input key. Available upstream: ${Array.from(upstreamSlugs).join(', ') || '(none)'}`);
          }
        }
      }
    }

    return errors;
  }

  private prepareInput(node: FlowNode, edges: FlowEdge[], nodeOutputs: Map<string, unknown>): unknown {
    const accumulated: Record<string, unknown> = {};
    // First, spread __input__ fields so flags like _approved are accessible
    const flowInput = nodeOutputs.get('__input__') as Record<string, unknown> | undefined;
    if (flowInput && typeof flowInput === 'object') {
      Object.assign(accumulated, flowInput);
    }
    // Then add all node outputs (overwrite __input__ keys with same name)
    for (const [key, value] of nodeOutputs) {
      if (key !== '__input__') {
        accumulated[key] = value;
      }
    }
    return accumulated;
  }

  private async executeNode(
    node: FlowNode,
    input: unknown,
    context: ExecutionContext,
    onEvent: EventCallback,
  ): Promise<unknown> {
    const nodeData = node.data as NodeData;
    const nodeType = (nodeData as any).type as string;

    switch (nodeType) {
      case 'trigger': {
        return input;
      }

      case 'llm-agent': {
        const config = (nodeData as any).config;
        if (!config?.endpointId) {
          throw new Error('LLM Agent: no endpoint configured');
        }

        if (!context.getEndpoint) {
          throw new Error('LLM Agent: execution context missing getEndpoint');
        }
        const endpoint = await context.getEndpoint(config.endpointId);
        if (!endpoint) {
          throw new Error(`LLM Agent: endpoint ${config.endpointId} not found`);
        }

        // Extract message from input — supports both flat {message, history}
        // and chat_input-wrapped {chat_input: {message, history}} formats
        const inputObj = input as Record<string, unknown> | undefined;
        const chatInput = inputObj?.chat_input as Record<string, unknown> | undefined;
        const userMessage = typeof inputObj?.message === 'string'
          ? inputObj.message
          : typeof chatInput?.message === 'string'
            ? chatInput.message
            : typeof inputObj === 'string'
              ? inputObj
              : JSON.stringify(inputObj);

        const history: Array<{ role: 'user' | 'assistant'; content: string }> =
          Array.isArray(inputObj?.history) ? inputObj.history as any[]
          : Array.isArray(chatInput?.history) ? chatInput.history as any[]
          : [];

        const messages = [...history, { role: 'user' as const, content: userMessage }];

        // Collect tool definitions from MCP Tool nodes connected via tool-input handles
        const toolDefs: Array<{ name: string; description: string; input_schema: Record<string, unknown> }> = [];
        if (context.getMCPServer) {
          // Look for edges where target is this LLM node and targetHandle starts with 'tool-input'
          const toolEdges = context.flowEdges?.filter(
            (e: any) => e.target === node.id && (e.targetHandle?.startsWith('tool-input') || e.sourceHandle === 'tool-output')
          ) || [];

          for (const edge of toolEdges) {
            const mcpNode = context.flowNodes?.find((n: any) => n.id === edge.source);
            if (!mcpNode || mcpNode.data?.type !== 'mcp-tool') continue;
            const mcpConfig = (mcpNode.data as any).config || {};
            if (!mcpConfig.serverId) continue;

            try {
              const server = await context.getMCPServer!(mcpConfig.serverId);
              if (server) {
                const serverTools = server.tools || [];
                const selected: string[] = mcpConfig.toolNames?.length
                  ? mcpConfig.toolNames
                  : mcpConfig.toolName
                    ? mcpConfig.toolName === '*' ? serverTools.map((t: any) => t.name) : [mcpConfig.toolName]
                    : [];
                // Empty selection = all tools pass through
                const toolList = selected.length > 0 ? selected : serverTools.map((t: any) => t.name);
                for (const toolName of toolList) {
                  const tool = serverTools.find((t: any) => t.name === toolName);
                  if (tool) {
                    toolDefs.push({
                      name: tool.name,
                      description: tool.description || '',
                      input_schema: tool.inputSchema || {},
                    });
                  }
                }
              }
            } catch { /* skip unavailable servers */ }
          }
        }

        // Auto-inject built-in tools so the LLM can use store, file, utility tools
        toolDefs.push(
          { name: 'store_get', description: 'Read a persisted value by key', input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
          { name: 'store_set', description: 'Persist a value by key (upserts)', input_schema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string', description: 'Any JSON-serializable value' } }, required: ['key', 'value'] } },
          { name: 'store_delete', description: 'Remove a persisted value by key', input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
          { name: 'store_list', description: 'List all stored keys', input_schema: { type: 'object', properties: {} } },
          { name: 'file_read', description: 'Read a file from the shared workspace', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
          { name: 'file_write', description: 'Write content to a file in the shared workspace', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
          { name: 'file_list', description: 'List files in a directory', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
          { name: 'now', description: 'Get the current date and time. Specify timezone (e.g. "Europe/Amsterdam") or locale (e.g. "nl-NL") for localized output.', input_schema: { type: 'object', properties: { timezone: { type: 'string' }, locale: { type: 'string' } } } },
          { name: 'uuid', description: 'Generate a UUID', input_schema: { type: 'object', properties: {} } },
          { name: 'log', description: 'Write a log entry (info/warn/error)', input_schema: { type: 'object', properties: { level: { type: 'string' }, message: { type: 'string' } }, required: ['message'] } },
          { name: 'fetch', description: 'Perform an HTTP GET request', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
        );

        // Token streaming callback
        const onToken = (token: string) => {
          onEvent(node.id, {
            type: 'stream.token',
            executionId: '',
            nodeId: node.id,
            data: { nodeId: node.id, token },
            timestamp: new Date().toISOString(),
          });
        };

        // Tool-use loop: LLM may call tools, we execute them, feed back results
        const MAX_TOOL_ROUNDS = 5;
        const conversation = [...messages];
        let finalContent = '';

        // Resolve {{input.path.to.field}} template variables in system prompt
        let resolvedPrompt = resolveTemplate(config.systemPrompt || '', input);

        // Inject structured output tool when JSON output is selected
        const allTools = [...(toolDefs || [])];
        let structuredOutputUsed = false;
        if (config.responseFormat === 'json_object') {
          const outputDesc = 'Call this tool to output structured data. Use it to respond — do not output text, only call this tool.';
          if (config.outputSchema) {
            try {
              const schema = JSON.parse(config.outputSchema);
              allTools.push({ name: 'structured_output', description: outputDesc, input_schema: schema });
            } catch {}
          } else {
            allTools.push({ name: 'structured_output', description: outputDesc, input_schema: { type: 'object', properties: {}, additionalProperties: true } as any });
          }
        }
        // Tell the LLM to use the structured_output tool when JSON output is selected
        if (allTools.some(t => t.name === 'structured_output')) {
          resolvedPrompt += (resolvedPrompt ? '\n\n' : '') + 'You must use the structured_output tool to respond — call it with your structured data. Do not output plain text.';
        }

        // Track all tool calls for the execution log
        const executedTools: Array<{ name: string; input: any; result: string }> = [];
        const result: Record<string, unknown> = { content: '' };

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (this.abortController.signal.aborted) break;

          const response = await callLLM(
            {
              endpointId: config.endpointId,
              model: config.model || endpoint.providerType,
              systemPrompt: resolvedPrompt,
              messages: conversation,
              temperature: config.temperature ?? 0.7,
              maxTokens: config.maxTokens ?? 4096,
              onToken,
              tools: allTools.length > 0 ? allTools : undefined,
              signal: this.abortController.signal,
            },
            endpoint,
          );

          if (this.abortController.signal.aborted) break;

          if (response.text) {
            finalContent = response.text;
          }

          // If no tool calls, we're done
          if (!response.toolCalls || response.toolCalls.length === 0) break;

          // Add the assistant's tool-use message to conversation
          conversation.push({ role: 'assistant' as const, content: response.text || '' });

          // Execute each tool call and add results
          for (const tc of response.toolCalls) {
            // structured_output is a carrier for the output schema, not a real tool
            if (tc.name === 'structured_output') {
              structuredOutputUsed = true;
              Object.assign(result, tc.input as Record<string, unknown>);
              executedTools.push({ name: tc.name, input: tc.input, result: 'used as node output' });
              break;
            }
            try {
              // Find the MCP config from the connected tool nodes
              const toolEdges = context.flowEdges?.filter(
                (e: any) => e.target === node.id && (e.targetHandle?.startsWith('tool-input') || e.sourceHandle === 'tool-output')
              ) || [];
              let toolResult = 'Tool not found';

              for (const edge of toolEdges) {
                const mcpNode = context.flowNodes?.find((n: any) => n.id === edge.source);
                if (!mcpNode) continue;
                const mcpConfig = (mcpNode.data as any).config || {};
                const mcpToolNames: string[] = mcpConfig.toolNames?.length
                  ? mcpConfig.toolNames
                  : mcpConfig.toolName
                    ? mcpConfig.toolName === '*' ? [] : [mcpConfig.toolName]
                    : [];
                // Empty selection = all tools on this node match
                const toolMatch = mcpToolNames.length === 0 || mcpToolNames.includes(tc.name);
                if (toolMatch && mcpConfig.serverId) {
                  const { mcpHub } = await import('../tools/hub.js');
                  const server = await context.getMCPServer!(mcpConfig.serverId);
                  if (server) {
                    if (!mcpHub.isConnected(server.id)) {
                      await mcpHub.connect(server);
                    }
                    toolResult = JSON.stringify(await mcpHub.callTool(server.id, tc.name, tc.input));
                  }
                  break;
                }
              }

              // Handle built-in utility tools (auto-injected, no MCP node required)
              if (toolResult === 'Tool not found') {
                try {
                  const { callBuiltInTool } = await import('../tools/built-in.js');
                  toolResult = await callBuiltInTool(tc.name, { ...tc.input, _runId: this.currentRunId });
                } catch (err) {
                  toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
                }
              }

              conversation.push({
                role: 'user' as const,
                content: `Tool result for ${tc.name}: ${toolResult}`,
              });

              executedTools.push({ name: tc.name, input: tc.input, result: toolResult });

              onEvent(node.id, {
                type: 'log',
                executionId: '',
                nodeId: node.id,
                data: { nodeId: node.id, toolCall: tc.name, toolInput: tc.input, toolResult },
                timestamp: new Date().toISOString(),
              });
            } catch (err) {
              executedTools.push({ name: tc.name, input: tc.input, result: `Error: ${err instanceof Error ? err.message : String(err)}` });
              conversation.push({
                role: 'user' as const,
                content: `Tool error for ${tc.name}: ${err instanceof Error ? err.message : String(err)}`,
              });
            }
          }
          // structured_output is the final response — no more rounds needed
          if (structuredOutputUsed) break;
        }

        
        result.content = finalContent;
        if (executedTools.length > 0) result.toolCalls = executedTools;
        if (!structuredOutputUsed && finalContent && config.responseFormat === 'json_object') {
          try {
            const parsed = JSON.parse(finalContent);
            if (typeof parsed === 'object' && parsed !== null) Object.assign(result, parsed);
          } catch {}
        }
        return result;
      }

      case 'mcp-tool': {
        const config = (nodeData as any).config;
        if (!config?.serverId || !config?.toolName) {
          throw new Error('MCP Tool: serverId and toolName are required');
        }

        if (!context.getMCPServer) {
          throw new Error('MCP Tool: getMCPServer not available in execution context');
        }

        const server = await context.getMCPServer(config.serverId);
        if (!server) {
          throw new Error(`MCP Tool: server ${config.serverId} not found`);
        }

        // Use the MCP Hub to call the tool
        const { mcpHub } = await import('../tools/hub.js');

        // Ensure the server is connected
        if (!mcpHub.isConnected(server.id)) {
          await mcpHub.connect(server);
        }

        const toolResult = await mcpHub.callTool(server.id, config.toolName, config.parameters || {});
        
        return { result: toolResult, toolName: config.toolName, serverName: server.name };
      }

      case 'retriever': {
        const config = (nodeData as any).config;
        const collectionName = config?.collectionName || 'default';
        const topK = config?.topK ?? 5;
        const minScore = config?.minScore ?? 0.5;

        // Extract query from input
        const inputObj = input as Record<string, unknown> | undefined;
        const query = typeof inputObj?.message === 'string'
          ? inputObj.message
          : typeof inputObj === 'string'
            ? inputObj
            : JSON.stringify(inputObj);

        // Generate embedding using the configured provider
        let embedding: number[] = new Array(1536).fill(0);
        if (config?.embeddingProviderId && context.getEmbeddingProvider) {
          const provider = await context.getEmbeddingProvider(config.embeddingProviderId);
          if (provider) {
            const OpenAI = (await import('openai')).default;
            const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl || undefined });
            const resp = await client.embeddings.create({ model: provider.model, input: query });
            embedding = resp.data[0].embedding;
          }
        }

        // Search vector store
        let results: Array<{ documentId: string; chunkText: string; chunkIndex: number; similarity: number }> = [];
        if (context.searchSimilar) {
          results = await context.searchSimilar(collectionName, embedding, topK, minScore);
        }

        // Format as context
        const chunks = results.map(r => ({
          text: r.chunkText,
          similarity: r.similarity,
          documentId: r.documentId,
        }));

        const contextText = chunks.map(c => c.text).join('\n\n');

        
        return { query, chunks, context: contextText, count: chunks.length };
      }

      case 'branch': {
        const config = (nodeData as BranchNodeData).config;
        const rawCondition = config.condition;
        const labels = config.outputLabels || ['true', 'false'];

        let verdict = false;
        let matchedLabel = '';
        const inputObj = input as Record<string, unknown> | undefined;
        try {
          if (rawCondition && rawCondition.trim()) {
            // Resolve {{input.var}} templates to actual values
            const resolved = resolveTemplate(rawCondition, input);
            // Try evaluating as JS expression first
            let result: unknown;
            try {
              result = new Function('input', `return ${resolved}`)(inputObj);
            } catch {
              // JS evaluation failed — treat resolved string as the value itself
              result = resolved;
            }
            const strVal = String(result).trim();
            // Try to match the value against an output label
            matchedLabel = labels.find(l => l && l.toLowerCase() === strVal.toLowerCase()) || '';
            if (matchedLabel) {
              verdict = true;
            } else {
              // Check if a default path is configured
              const defaultPath = config.defaultPath;
              if (defaultPath && labels.includes(defaultPath)) {
                matchedLabel = defaultPath;
                verdict = true;
              } else {
                throw new Error(
                  `Branch condition "${rawCondition}" returned "${strVal}", which does not match any output label. ` +
                  `Available labels: [${labels.filter(Boolean).join(', ')}]. ` +
                  `Add a matching output label, configure a default path, or fix the condition.`
                );
              }
            }
          }
        } catch (err) {
          if (err instanceof Error) throw err;
          verdict = false;
        }

        return { verdict, label: matchedLabel || (verdict ? labels[0] : labels[1]) };
      }

      case 'code': {
        const config = (nodeData as any).config;
        const code = config.code || 'return input;';

        try {
          const fn = new Function('input', code);
          return fn(input);
        } catch (err) {
          throw new Error(`Code node execution failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      case 'parallel': {
        const config = (nodeData as any).config;
        const subNodes = (config?.subNodes || []) as FlowNode[];
        if (subNodes.length === 0) return { merged: {}, note: 'no sub-nodes' };

        // Run all sub-nodes in parallel — any failure aborts all siblings
        const parallelAbort = new AbortController();
        const results = await Promise.all(
          subNodes.map(async (subNode) => {
            if (parallelAbort.signal.aborted) throw new Error('Aborted by sibling failure');
            try {
              // Create a wrapper context that checks the parallel abort signal
              const output = await this.executeNode(subNode, input, { ...context }, onEvent);
              await onEvent(node.id, {
                type: 'log',
                executionId: '',
                nodeId: node.id,
                data: { nodeId: node.id, subNodeId: subNode.id, subNodeType: subNode.data.type, status: 'completed', output },
                timestamp: new Date().toISOString(),
              });
              const subLabel = subNode.data?.label || subNode.data?.type || subNode.id;
              return { id: subLabel, type: subNode.data.type, output };
            } catch (err) {
              parallelAbort.abort(); // Kill all other siblings
              throw err;
            }
          }),
        );

        // Merge all outputs by node ID
        const merged: Record<string, unknown> = {};
        for (const r of results) {
          merged[r.id] = r.output;
        }
        
        return merged;
      }

      case 'hitl': {
        const inp = input as Record<string, unknown> | undefined;
        if (inp?._approved) {
          return { decision: inp._decision || 'approved', feedback: inp._feedback || '', reviewedContent: inp._reviewedContent || inp, _iterationCount: (inp as any)._iterationCount || 0 };
        }
        // First run: pause for human input with resolved prompt
        const hitlCfg = (nodeData as any).config || {};
        const resolvedPrompt = resolveTemplate(hitlCfg.prompt || '', input);
        const buttons = hitlCfg.buttons || [{ label: 'Approve', value: 'approved', icon: 'check_circle' }, { label: 'Reject', value: 'rejected', icon: 'cancel' }];
        const assignmentType = hitlCfg.assignmentType;
        const assignees = hitlCfg.assignees;
        const requiredApprovals = hitlCfg.requiredApprovals;
        throw new HitlPauseError(node.id, {}, buttons, resolvedPrompt, assignmentType, assignees, requiredApprovals);
      }

      case 'output': {
        const inp = input as Record<string, unknown> | undefined;
        const nodeConfig = (nodeData as any)?.config || {};
        const inputFields: string[] = nodeConfig.inputFields || [];

        // Streaming mode: look for upstream LLM agent content in accumulated input
        if (nodeConfig.streaming && inp && typeof inp === 'object') {
          for (const val of Object.values(inp)) {
            if (val && typeof val === 'object' && typeof (val as any).content === 'string') {
              return (val as any).content;
            }
          }
        }

        // Single dot-path field: extract the inner value directly
        if (inputFields.length === 1 && inputFields[0].includes('.')) {
          const [rawLabel, field] = inputFields[0].split('.');
          const slugLabel = slugify(rawLabel);
          // Try by slugified label key first
          const byLabel = (inp as Record<string, unknown>)?.[slugLabel] as Record<string, unknown> | undefined;
          if (byLabel && field in byLabel) {
            return byLabel[field];
          }
          // Fallback: scan all values for an object containing the target field as a string
          if (inp && typeof inp === 'object') {
            for (const val of Object.values(inp)) {
              if (val && typeof val === 'object' && !Array.isArray(val) && typeof (val as any)[field] === 'string') {
                return (val as any)[field];
              }
            }
          }
        }

        if (inputFields.length === 0) {
          // No field selection — return all accumulated data as-is
          return inp || input;
        }

        // Single label-only field: return the value under that label
        if (inputFields.length === 1) {
          const slugLabel = slugify(inputFields[0]);
          return (inp as Record<string, unknown>)?.[slugLabel] || inp;
        }

        // Multiple fields: return as object
        return inp || input;
      }

      case 'stop': {
        const config = (nodeData as any)?.config || {};
        const status = config.status || 'completed';
        const message = config.message || 'Execution stopped by Stop node';
        throw new FlowStopError(node.id, message, status);
      }

      default:
        throw new Error(`Unknown node type: ${(nodeData as any).type}`);
    }
  }
}

// Resolve {{input.path.to.field}} template variables in system prompts.
// Looks up dot-notation paths in the input data.
function resolveTemplate(template: string, data: unknown): string {
  return template.replace(/\{\{input\.([^}]+)\}\}/g, (match, path: string) => {
    const parts = path.trim().split('.');
    let current: unknown = data;
    for (const part of parts) {
      const bracketMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (bracketMatch) {
        // Bracket indexing: items[0] → items then index 0
        const key = bracketMatch[1];
        const idx = parseInt(bracketMatch[2]);
        if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
          const arr = (current as Record<string, unknown>)[key];
          if (Array.isArray(arr) && idx < arr.length) {
            current = arr[idx];
          } else {
            console.warn(`Template variable ${match} could not be resolved`);
            return '';
          }
        } else {
          console.warn(`Template variable ${match} could not be resolved`);
          return '';
        }
      } else if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        // Try slugified version of the part (labels are stored under slugified keys)
        const slugPart = slugify(part);
        if (current && typeof current === 'object' && slugPart in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[slugPart];
        } else {
          console.warn(`Template variable ${match} could not be resolved`);
          return '';
        }
      }
    }
    if (typeof current === 'object') return JSON.stringify(current);
    return String(current);
  });
}
