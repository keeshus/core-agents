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

export type EventCallback = (nodeId: string, event: SSEEvent) => void | Promise<void>;

// Database lookups the executor needs at runtime
export interface ExecutionContext {
  getEndpoint: (endpointId: string) => Promise<ResolvedEndpoint | null>;
  getMCPServer?: (serverId: string) => Promise<any>;
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
  ): Promise<{ output: Record<string, unknown>; steps: ExecutionStep[] }> {
    const { sorted, cycles } = topologicalSort(flow.nodes, flow.edges);

    if (cycles.length > 0) {
      throw new Error(`Flow contains cycles: ${JSON.stringify(cycles)}`);
    }

    const nodeOutputs = new Map<string, unknown>();
    // Store the initial input at a special key
    nodeOutputs.set('__input__', input);

    const steps: ExecutionStep[] = [];

    for (const node of sorted) {
      if (this.abortController.signal.aborted) break;

      const stepInput = this.prepareInput(node, flow.edges, nodeOutputs);

      // Enrich step input with node config for debugging (LLM prompt, model, etc.)
      const enrichedInput: Record<string, unknown> = {
        ...(stepInput as Record<string, unknown> || {}),
        _nodeType: node.data.type,
        _nodeLabel: node.data.label || node.data.type,
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
        const output = await this.executeNode(node, stepInput, context, onEvent);
        nodeOutputs.set(node.id, output);

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
    const incomingEdges = edges.filter(e => e.target === node.id);

    if (incomingEdges.length === 0) {
      // No incoming edges: use the flow input
      return nodeOutputs.get('__input__');
    }

    if (incomingEdges.length === 1) {
      return nodeOutputs.get(incomingEdges[0].source);
    }

    // Multiple incoming: merge all
    const merged: Record<string, unknown> = {};
    for (const e of incomingEdges) {
      const sourceOutput = nodeOutputs.get(e.source);
      if (sourceOutput !== undefined) {
        merged[e.source] = sourceOutput;
      }
    }
    return merged;
  }

  private async executeNode(
    node: FlowNode,
    input: unknown,
    context: ExecutionContext,
    onEvent: EventCallback,
  ): Promise<unknown> {
    const nodeData = node.data as NodeData;

    switch (nodeData.type) {
      case 'trigger':
        return input; // Pass through

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

        // Build messages from history if available, otherwise just the current message
        const history: Array<{ role: 'user' | 'assistant'; content: string }> =
          Array.isArray(inputObj?.history) ? inputObj.history as any[] : [];

        const messages = [...history, { role: 'user' as const, content: userMessage }];

        // Token streaming callback
        let streamedContent = '';
        const onToken = (token: string) => {
          streamedContent += token;
          onEvent(node.id, {
            type: 'stream.token',
            executionId: '',
            nodeId: node.id,
            data: { nodeId: node.id, token },
            timestamp: new Date().toISOString(),
          });
        };

        const response = await callLLM(
          {
            endpointId: config.endpointId,
            model: config.model || endpoint.providerType,
            systemPrompt: config.systemPrompt || '',
            messages,
            temperature: config.temperature ?? 0.7,
            maxTokens: config.maxTokens ?? 4096,
            onToken,
          },
          endpoint,
        );

        return { content: response, streamedContent: streamedContent || response };
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

        const result = await mcpHub.callTool(server.id, config.toolName, config.parameters || {});
        return { result, toolName: config.toolName, serverName: server.name };
      }

      case 'retriever': {
        // Placeholder -- RAG will be wired in Phase 4
        return { message: 'Retriever execution coming in Phase 4', input };
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

      case 'output':
        return input; // Pass through -- formatting handled by the caller

      default:
        throw new Error(`Unknown node type: ${(nodeData as any).type}`);
    }
  }
}
