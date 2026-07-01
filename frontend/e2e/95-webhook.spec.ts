import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { pollExecution } from './helpers/stream';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Webhook trigger', () => {
  test('webhook flow executes via POST to webhook endpoint', async ({ request }) => {
    const name = uniqueFlowName('WebhookTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        {
          id: 't1', type: 'trigger', position: { x: 0, y: 0 },
          data: {
            label: 'Webhook',
            type: 'trigger',
            config: { triggerType: 'webhook', webhookSecret: 'test-secret', inputSchema: '{"message":"string"}' },
          },
        },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Echo', type: 'code', config: { code: 'return { result: input.message };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['echo.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();

    // POST to webhook endpoint
    const webhookRes = await request.post(`${API_URL}/webhook/${flow.id}?secret=test-secret`, {
      data: { message: 'hello webhook' },
    });
    expect(webhookRes.ok()).toBe(true);
    const webhookData = await webhookRes.json();

    // Should return a queued execution ID
    expect(webhookData.executionId).toBeDefined();
    expect(webhookData.status).toBe('queued');

    // Poll the execution until it completes (worker processes it via BullMQ)
    const exec = await pollExecution(request, webhookData.executionId, 45000);
    expect(exec.status).toBe('completed');

    await deleteFlow(request, flow.id);
  });
});
