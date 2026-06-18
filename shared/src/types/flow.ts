import { z } from 'zod';

// ── Node type enum ──────────────────────────────────────────

export const NODE_TYPES = [
  'trigger',
  'llm-agent',
  'mcp-tool',
  'retriever',
  'branch',
  'code',
  'output',
  'parallel',
  'hitl',
  'stop',
] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type NodeCategory = 'input' | 'processing' | 'tools' | 'output';

export const nodeTypeSchema = z.enum(NODE_TYPES);

// ── Base node data ──────────────────────────────────────────

export interface BaseNodeData {
  label: string;
  type: NodeType;
  config: Record<string, unknown>;
}

// ── Per-node configs ────────────────────────────────────────

export interface TriggerNodeData extends BaseNodeData {
  type: 'trigger';
  config: {
    triggerType: 'manual' | 'chat' | 'webhook' | 'schedule';
    webhookSecret?: string;
    cronExpression?: string;
    inputSchema?: string;
    scheduleInput?: string;
  };
}

export interface LLMAgentNodeData extends BaseNodeData {
  type: 'llm-agent';
  config: {
    endpointId: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    responseFormat: 'text' | 'json_object';
    outputSchema?: string;
    inputFields?: string[];
  };
}

export interface MCPToolNodeData extends BaseNodeData {
  type: 'mcp-tool';
  config: {
    serverId: string;
    toolName: string;
    parameters: Record<string, unknown>;
  };
}

export interface RetrieverNodeData extends BaseNodeData {
  type: 'retriever';
  config: {
    embeddingProviderId: string;
    vectorStoreId: string;
    collectionName: string;
    topK: number;
    minScore: number;
  };
}

export interface BranchNodeData extends BaseNodeData {
  type: 'branch';
  config: {
    condition: string;
    outputLabels: string[];
    inputFields?: string[];
  };
}

export interface CodeNodeData extends BaseNodeData {
  type: 'code';
  config: {
    language: 'javascript' | 'python';
    code: string;
    outputSchema?: string;
    inputFields?: string[];
  };
}

export interface OutputNodeData extends BaseNodeData {
  type: 'output';
  config: {
    format: 'text' | 'json' | 'markdown';
  };
}

export interface ParallelNodeData extends BaseNodeData {
  type: 'parallel';
  config: {
    subNodes: FlowNode[];
    subEdges: FlowEdge[];
  };
}

export interface HitlNodeData extends BaseNodeData {
  type: 'hitl';
  config: {
    prompt: string;
    buttons: Array<{ label: string; value: string }>;
    allowFeedback?: boolean;
    assignedTo?: { type: 'user'; userId: string } | { type: 'role'; roleId: string };
  };
}

export interface StopNodeData extends BaseNodeData {
  type: 'stop';
  config: {
    message: string;
    status: 'cancelled' | 'failed';
  };
}

export type NodeData =
  | TriggerNodeData
  | LLMAgentNodeData
  | MCPToolNodeData
  | RetrieverNodeData
  | BranchNodeData
  | CodeNodeData
  | OutputNodeData
  | ParallelNodeData
  | HitlNodeData
  | StopNodeData;

// ── Edge ─────────────────────────────────────────────────────

export interface EdgeCondition {
  label: string;
  expression: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  condition?: EdgeCondition;
}

// ── Flow node (React Flow shape) ─────────────────────────────

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

// ── Flow definition ─────────────────────────────────────────

export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ── Execution ────────────────────────────────────────────────

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'awaiting_approval';

export interface Execution {
  id: string;
  flowId: string;
  status: ExecutionStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ExecutionStep {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: NodeType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

// ── SSE events ───────────────────────────────────────────────

export type SSEEventType =
  | 'execution.started'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'stream.token'
  | 'execution.completed'
  | 'execution.failed'
  | 'execution.paused'
  | 'execution.stopped'
  | 'log';

export interface SSEEvent {
  type: SSEEventType;
  executionId: string;
  nodeId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ── Node catalog ─────────────────────────────────────────────

export interface NodeCatalogEntry {
  type: NodeType;
  label: string;
  category: NodeCategory;
  description: string;
  defaultConfig: Record<string, unknown>;
  inputs: number;
  outputs: number;
}
