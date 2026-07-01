import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { debugExecute } from './helpers/stream';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('All node types', () => {
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (res.ok()) { const ep = await res.json(); mockEndpointId = ep.id; }
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  const cookie = getAuthCookie() || undefined;

  test('code node transforms input', async ({ request }) => {
    const name = uniqueFlowName('CodeTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Transform', type: 'code', config: { code: 'return { result: input.message.toUpperCase() };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['transform.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'hello world' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    // Code node output is stored under its node ID
    const output = completed!.data?.output;
    expect(output).toBeDefined();
    expect(output.c1?.result).toBe('HELLO WORLD');
    await deleteFlow(request, flow.id);
  });

  test('branch node routes based on condition', async ({ request }) => {
    const name = uniqueFlowName('BranchTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'b1', type: 'branch', position: { x: 300, y: 0 }, data: { label: 'Check', type: 'branch', config: { condition: 'input.message === "yes"', outputLabels: ['true', 'false'] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: -100 }, data: { label: 'TruePath', type: 'output', config: { inputFields: ['check.verdict'] } } },
        { id: 'o2', type: 'output', position: { x: 600, y: 100 }, data: { label: 'FalsePath', type: 'output', config: { inputFields: ['check.verdict'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'b1', targetHandle: 'input-0' },
        { id: 'e2', source: 'b1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 'b1', sourceHandle: 'output-1', target: 'o2', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'yes' }, cookie);
    const branchStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'b1');
    expect(branchStep).toBeDefined();
    expect(branchStep!.data?.output?.verdict).toBe(true);
    expect(branchStep!.data?.output?.label).toBe('true');
    await deleteFlow(request, flow.id);
  });

  test('llm agent returns mock text response', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');
    const name = uniqueFlowName('LLMTextTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'LLM Agent', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'You are helpful. MOCK_RESPONSE: "Hello from mock LLM!"', temperature: 0.7, maxTokens: 256, responseFormat: 'text' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['llm_agent.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    // The LLM agent output is stored under its node ID 'l1'
    expect(completed!.data?.output?.l1?.content).toContain('Hello from mock LLM');
    await deleteFlow(request, flow.id);
  });

  test('parallel node runs sub-nodes concurrently', async ({ request }) => {
    const name = uniqueFlowName('ParallelTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'p1', type: 'parallel', position: { x: 300, y: 0 }, data: { label: 'Parallel', type: 'parallel', config: { subNodes: [{ id: 's1', type: 'code', position: { x: 0, y: 0 }, data: { label: 'SubA', type: 'code', config: { code: 'return { result: input.message + \" A\" };' } } }, { id: 's2', type: 'code', position: { x: 0, y: 100 }, data: { label: 'SubB', type: 'code', config: { code: 'return { result: input.message + \" B\" };' } } }], subEdges: [] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['parallel.merged'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'p1', targetHandle: 'input-0' },
        { id: 'e2', source: 'p1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'hello' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed!.data?.output;
    expect(output).toBeDefined();
    // Parallel node output is stored under its slugified node label
    expect(output.p1?.SubA?.result).toBe('hello A');
    expect(output.p1?.SubB?.result).toBe('hello B');
    await deleteFlow(request, flow.id);
  });

  test('stop node terminates execution early', async ({ request }) => {
    const name = uniqueFlowName('StopTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 's1', type: 'stop', position: { x: 300, y: 0 }, data: { label: 'Stop', type: 'stop', config: { status: 'completed', message: 'Done early' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['trigger.message'] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 's1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'should stop' }, cookie);
    // Stop node emits 'execution.stopped' (not 'execution.completed')
    const stopped = events.find(e => e.type === 'execution.stopped');
    expect(stopped).toBeDefined();
    expect(stopped!.data?.status).toBe('completed');
    await deleteFlow(request, flow.id);
  });
});
