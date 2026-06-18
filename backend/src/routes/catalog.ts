import { Router } from 'express';
import type { NodeCatalogEntry } from 'core-agents-shared';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const catalog: NodeCatalogEntry[] = [
  {
    type: 'trigger',
    label: 'Trigger',
    category: 'input',
    description: 'Start a flow from a chat message, manual trigger, webhook, or schedule',
    defaultConfig: { triggerType: 'manual', inputSchema: '' },
    inputs: 0,
    outputs: 1,
  },
  {
    type: 'llm-agent',
    label: 'LLM Agent',
    category: 'processing',
    description: 'Call an LLM with a system prompt. Select from centrally managed endpoints.',
    defaultConfig: { endpointId: '', model: '', systemPrompt: '', temperature: 0.7, maxTokens: 4096, responseFormat: 'text', outputSchema: '' },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'mcp-tool',
    label: 'MCP Tool',
    category: 'tools',
    description: 'Call a tool on a centrally configured MCP server',
    defaultConfig: { serverId: '', toolName: '', parameters: {} },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'retriever',
    label: 'Retriever',
    category: 'tools',
    description: 'Query a vector store for relevant documents using semantic search',
    defaultConfig: { embeddingProviderId: '', vectorStoreId: '', collectionName: '', topK: 5, minScore: 0.7 },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'branch',
    label: 'Condition',
    category: 'processing',
    description: 'Route execution based on a condition expression. Creates true/false paths.',
    defaultConfig: { condition: '', outputLabels: ['true', 'false'] },
    inputs: 1,
    outputs: 2,
  },
  {
    type: 'code',
    label: 'Code',
    category: 'processing',
    description: 'Run custom JavaScript code to transform data between nodes',
    defaultConfig: { language: 'javascript', code: '// Transform the input payload\nreturn payload;' },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'parallel',
    label: 'Parallel',
    category: 'processing',
    description: 'Run multiple sub-nodes concurrently. Each receives the same input, and their outputs are merged.',
    defaultConfig: { subNodes: [], subEdges: [] },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'hitl',
    label: 'Human in the Loop',
    category: 'processing',
    description: 'Pause the flow for human approval. Shows upstream output and waits for approve/reject.',
    defaultConfig: { prompt: 'Please review the following before continuing:', buttons: [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }], allowFeedback: true },
    inputs: 1,
    outputs: 1,
  },
  {
    type: 'stop',
    label: 'Stop',
    category: 'processing',
    description: 'Immediately stops the flow execution',
    defaultConfig: { message: 'Execution stopped', status: 'cancelled' },
    inputs: 1,
    outputs: 0,
  },
  {
    type: 'output',
    label: 'Output',
    category: 'output',
    description: 'Final output of the flow. Formats the result as text, JSON, or markdown.',
    defaultConfig: { format: 'json' },
    inputs: 1,
    outputs: 0,
  },
];

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(catalog);
  }),
);

export default router;
