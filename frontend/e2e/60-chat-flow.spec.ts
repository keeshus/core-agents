import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Chat flow', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Chat Flow E2E'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat', type: 'trigger', config: { triggerType: 'chat' } } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['chat.message'] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    flowId = flow.id;
  });

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  test('chat page loads and allows starting a new chat', async ({ page }) => {
    await page.goto(`/chat/${flowId}`);
    await expect(page.getByText('Chat Sessions')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('New Chat')).toBeVisible({ timeout: 5000 });
    await page.getByText('New Chat').click();
    await expect(page).toHaveURL(/\/chat\/[^/]+\/[^/]+/);
    await expect(page.getByLabel('Message')).toBeVisible({ timeout: 10000 });
  });
});
