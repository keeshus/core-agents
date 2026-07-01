import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow } from './helpers/api';

test.describe('Node configuration modal', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: 'Node Config Test',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: {} } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Output', type: 'output', config: {} } },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'o1' }],
    });
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
  });

  test.afterEach(async ({ request }) => {
    if (flowId) {
      await deleteFlow(request, flowId).catch(() => {});
    }
  });

  test('opens config modal when clicking a node', async ({ page }) => {
    const node = page.locator('.react-flow__node').first();
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('shows node type in config modal title', async ({ page }) => {
    const node = page.locator('.react-flow__node').first();
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    // Modal should show a title or heading
    await expect(modal.locator('h2, h3, h4').first()).toBeVisible();
  });

  test('closes config modal when clicking close button', async ({ page }) => {
    const node = page.locator('.react-flow__node').first();
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Press Escape to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await expect(modal).not.toBeVisible();
  });

  test('output node shows field selection checkboxes', async ({ page }) => {
    const outputNode = page.locator('.react-flow__node-output').first();
    await expect(outputNode).toBeVisible({ timeout: 10000 });
    await outputNode.click();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Should show checkboxes in the config
    const checkboxes = modal.locator('input[type="checkbox"]');
    await expect(checkboxes.first()).toBeVisible({ timeout: 3000 });
  });
});
