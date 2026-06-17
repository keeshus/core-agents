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

export class HitlPauseError extends Error {
  public nodeId: string;
  public savedOutputs: Record<string, unknown>;
  public buttons: Array<{ label: string; value: string }>;
  public prompt: string;
  constructor(nodeId: string, savedOutputs: Record<string, unknown>, buttons?: Array<{ label: string; value: string }>, prompt?: string) {
    super(`HITL: waiting for human input at node ${nodeId}`);
    this.name = 'HitlPauseError';
    this.nodeId = nodeId;
    this.savedOutputs = savedOutputs;
    this.buttons = buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }];
    this.prompt = prompt || '';
  }
}

export type EventCallback = (nodeId: string, event: SSEEvent) => void | Promise<void>;

// Database lookups the executor needs at runtime
export interface ExecutionContext {
  getEndpoint: (endpointId: string) => Promise<ResolvedEndpoint | null>;
  getMCPServer?: (serverId: string) => Promise<any>;
  getEmbeddingProvider?: (providerId: string) => Promise<{ providerType: string; apiKey: string; baseUrl: string | null; model: string } | null>;
  getVectorStore?: (storeId: string) => Promise<{ name: string; url: string; apiKey: string | null } | null>;
  searchSimilar?: (collectionName: string, queryEmbedding: number[], topK: number, minScore: number) => Promise<Array<{ documentId: string; chunkText: string; chunkIndex: number; similarity: number }>>;
  flowNodes?: Array<{ id: string; type: string; data: any }>;
  flowEdges?: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>;
}

export class FlowExecutor {
  private abortController: AbortController;

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
    options?: { replayFrom?: string; replayOutputs?: Record<string, unknown>; inputOverride?: Record<string, unknown> },
  ): Promise<{ output: Record<string, unknown>; steps: ExecutionStep[] }> {
    const { sorted, cycles } = topologicalSort(flow.nodes, flow.edges);

    if (cycles.length > 0) {
      throw new Error(`Flow contains cycles: ${JSON.stringify(cycles)}`);
    }

    const nodeOutputs = new Map<string, unknown>();
    nodeOutputs.set('__input__', options?.inputOverride || input);

    // If replaying: pre-load saved outputs from previous run, skip nodes before HITL
    const replayFrom = options?.replayFrom;
    const replayOutputs = options?.replayOutputs || {};
    let beforeHitl = !!replayFrom;

    const steps: ExecutionStep[] = [];

    for (const node of sorted) {
      if (this.abortController.signal.aborted) break;

      // Skip nodes before the HITL node when replaying
      if (beforeHitl) {
        if (node.id === replayFrom) {
          beforeHitl = false;
        } else if (replayOutputs[node.id] !== undefined) {
          nodeOutputs.set(node.id, replayOutputs[node.id]);
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

      // Check if this node should be skipped based on incoming edge conditions
      const incomingEdges = flow.edges.filter(e => e.target === node.id);
      if (incomingEdges.length > 0) {
        const sourceOutputs = incomingEdges.map(e => nodeOutputs.get(e.source));
        const allFiltered = incomingEdges.every((e, i) => {
          if (!e.condition?.label) return false;
          const src = sourceOutputs[i] as Record<string, unknown> | undefined;
          const branchLabel = (src as any)?.label;
          return branchLabel !== e.condition.label;
        });

        if (allFiltered && incomingEdges.some(e => e.condition?.label)) {
          nodeOutputs.set(node.id, { skipped: true, reason: 'No matching route' });
          continue;
        }
      }

      const stepInput = this.prepareInput(node, flow.edges, nodeOutputs);

      // If node has inputFields set, filter stepInput to only those fields
      // Supports dot-notation paths like "Label.fieldname" for nested access
      const nodeConfig = (node.data as any)?.config || {};
      const inputFields = nodeConfig.inputFields as string[] | undefined;
      const filteredInput = inputFields && inputFields.length > 0 && stepInput && typeof stepInput === 'object'
        ? (() => {
            const result: Record<string, unknown> = {};
            const input = stepInput as Record<string, unknown>;
            for (const path of inputFields) {
              const dot = path.indexOf('.');
              if (dot === -1) {
                // Whole label: copy all data under this label
                if (input[path] !== undefined) result[path] = input[path];
              } else {
                // Dot-path: extract specific field from within this label
                const label = path.slice(0, dot);
                const field = path.slice(dot + 1);
                const labelData = input[label] as Record<string, unknown> | undefined;
                if (labelData && field in labelData) {
                  if (!result[label]) result[label] = {};
                  (result[label] as Record<string, unknown>)[field] = labelData[field];
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
        data: { nodeId: node.id, nodeType: node.data.type, input: enrichedInput },
        timestamp: new Date().toISOString(),
      });

      try {
        // For HITL replay: separate what was displayed vs what gets forwarded
        let nodeInput = filteredInput;
        if (node.data.type === 'hitl' && replayFrom && node.id === replayFrom) {
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
        nodeOutputs.set(node.data.label || node.id, output);

        await onEvent(node.id, {
          type: 'step.completed',
          executionId: '',
          nodeId: node.id,
          data: { nodeId: node.id, nodeType: node.data.type, output: output as Record<string, unknown> },
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
      } catch (err) {
        // If HITL node paused, populate saved outputs before re-throwing
        if (err instanceof HitlPauseError) {
          const saved: Record<string, unknown> = {};
          for (const [k, v] of nodeOutputs) {
            if (k !== '__input__') saved[k] = v;
          }
          const hitlConfig = (node.data as any)?.config || {};
          throw new HitlPauseError(err.nodeId, saved, hitlConfig.buttons, hitlConfig.prompt);
        }
        const error = err instanceof Error ? err.message : String(err);
        await onEvent(node.id, {
          type: 'step.failed',
          executionId: '',
          nodeId: node.id,
          data: { nodeId: node.id, nodeType: node.data.type, error },
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

    return { output: Object.fromEntries(nodeOutputs), steps };
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

    switch (nodeData.type) {
      case 'trigger': {
        return input;
      }

      case 'llm-agent': {
        const config = (nodeData as any).config;
        if (!config?.endpointId) {
          throw new Error('LLM Agent: no endpoint configured');
        }

        const endpoint = await context.getEndpoint(config.endpointId);
        if (!endpoint) {
          throw new Error(`LLM Agent: endpoint ${config.endpointId} not found`);
        }

        // Extract message from input
        const inputObj = input as Record<string, unknown> | undefined;
        const userMessage = typeof inputObj?.message === 'string'
          ? inputObj.message
          : typeof inputObj === 'string'
            ? inputObj
            : JSON.stringify(inputObj);

        const history: Array<{ role: 'user' | 'assistant'; content: string }> =
          Array.isArray(inputObj?.history) ? inputObj.history as any[] : [];

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
            if (!mcpConfig.serverId || !mcpConfig.toolName) continue;

            try {
              const server = await context.getMCPServer!(mcpConfig.serverId);
              if (server) {
                const serverTools = server.tools || [];
                const tool = serverTools.find((t: any) => t.name === mcpConfig.toolName);
                if (tool) {
                  toolDefs.push({
                    name: tool.name,
                    description: tool.description || '',
                    input_schema: tool.inputSchema || {},
                  });
                }
              }
            } catch { /* skip unavailable servers */ }
          }
        }

        // Auto-inject built-in tools so the LLM can use store, file, utility tools
        toolDefs.push(
          { name: 'store.get', description: 'Read a persisted value by key', input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
          { name: 'store.set', description: 'Persist a value by key (upserts)', input_schema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string', description: 'Any JSON-serializable value' } }, required: ['key', 'value'] } },
          { name: 'store.delete', description: 'Remove a persisted value by key', input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
          { name: 'store.list', description: 'List all stored keys', input_schema: { type: 'object', properties: {} } },
          { name: 'file.read', description: 'Read a file from the shared workspace', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
          { name: 'file.write', description: 'Write content to a file in the shared workspace', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
          { name: 'file.list', description: 'List files in a directory', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
          { name: 'now', description: 'Get the current UTC date and time', input_schema: { type: 'object', properties: {} } },
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

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (this.abortController.signal.aborted) break;

          const response = await callLLM(
            {
              endpointId: config.endpointId,
              model: config.model || endpoint.providerType,
              systemPrompt: config.systemPrompt || '',
              messages: conversation,
              temperature: config.temperature ?? 0.7,
              maxTokens: config.maxTokens ?? 4096,
              onToken,
              responseFormat: config.responseFormat || 'text',
              outputSchema: config.outputSchema || undefined,
              tools: toolDefs.length > 0 ? toolDefs : undefined,
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
                if (mcpConfig.toolName === tc.name && mcpConfig.serverId) {
                  const { mcpHub } = await import('../mcp/hub.js');
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

              conversation.push({
                role: 'user' as const,
                content: `Tool result for ${tc.name}: ${toolResult}`,
              });

              onEvent(node.id, {
                type: 'log',
                executionId: '',
                nodeId: node.id,
                data: { nodeId: node.id, toolCall: tc.name, toolResult },
                timestamp: new Date().toISOString(),
              });
            } catch (err) {
              conversation.push({
                role: 'user' as const,
                content: `Tool error for ${tc.name}: ${err instanceof Error ? err.message : String(err)}`,
              });
            }
          }
        }

        
        const result: Record<string, unknown> = { content: finalContent };
        if (config?.responseFormat === 'json_object' && finalContent) {
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
        const { mcpHub } = await import('../mcp/hub.js');

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
        const condition = config.condition;
        const labels = config.outputLabels || ['true', 'false'];

        // Simple condition evaluation
        let verdict = false;
        try {
          const inputObj = input as Record<string, unknown> | undefined;
          // Support simple conditions like "input.score > 0.5"
          // For MVP, evaluate a simple truthy check
          if (condition && condition.trim()) {
            // Try to evaluate as a JS expression with the input in scope
            const fn = new Function('input', `return Boolean(${condition})`);
            verdict = fn(inputObj);
          }
        } catch {
          verdict = false;
        }

        
        return { verdict, label: verdict ? labels[0] : labels[1] };
      }

      case 'code': {
        const config = (nodeData as any).config;
        const code = config.code || 'return payload;';

        try {
          const fn = new Function('payload', code);
          
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
              return { id: subNode.id, type: subNode.data.type, output };
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
        // If replaying (user already approved), pass through the decision
        const inp = input as Record<string, unknown> | undefined;
        if (inp?._approved) {
          
          return { decision: inp._decision || 'approved', feedback: inp._feedback || '', reviewedContent: inp._reviewedContent || inp };
        }
        // First run: pause for human input
        throw new HitlPauseError(node.id, {}); // filled by execute loop
      }

      case 'output': {
        const inp = input as Record<string, unknown> | undefined;

        // text and json: return accumulated data as-is
        return inp || input;
      }

      default:
        throw new Error(`Unknown node type: ${(nodeData as any).type}`);
    }
  }
}
