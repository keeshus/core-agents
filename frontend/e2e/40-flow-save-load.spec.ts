import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow } from './helpers/api';

test.describe('Flow save and reload', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: 'Save Load Test',
      description: 'Testing persistence',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 50, y: 50 }, data: { label: 'My Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 400, y: 50 }, data: { label: 'My Output', type: 'output', config: {} } },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'o1' }],
    });
    const flow = await res.json();
    flowId = flow.id;
  });

  test.afterEach(async ({ request }) => {
    if (flowId) {
      await deleteFlow(request, flowId).catch(() => {});
    }
  });

  test('flow editor loads nodes and edges from saved flow', async ({ page }) => {
    await page.goto(`/flows/${flowId}/edit`);

    // Wait for React Flow to render
    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(2, { timeout: 10000 });

    // Edges should also be rendered
    const edges = page.locator('.react-flow__edge');
    await expect(edges).toHaveCount(1, { timeout: 5000 });
  });

  test('node labels appear on canvas as saved', async ({ page }) => {
    await page.goto(`/flows/${flowId}/edit`);

    // Node labels match what was saved
    await expect(page.getByText('My Trigger')).toBeVisible();
    await expect(page.getByText('My Output')).toBeVisible();
  });

  test('flow name appears in the editor header', async ({ page }) => {
    await page.goto(`/flows/${flowId}/edit`);

    // Flow name is in a TextField with label "Flow name"
    await expect(page.locator('input[value="Save Load Test"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('reload preserves canvas state', async ({ page }) => {
    await page.goto(`/flows/${flowId}/edit`);

    // Wait for nodes
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 10000 });

    // Reload
    await page.reload();
    await page.waitForTimeout(2000);

    // Nodes should still be there after reload
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 15000 });

    // Check that save button indicates no unsaved changes (optional)
  });
});
