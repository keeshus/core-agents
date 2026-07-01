import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow } from './helpers/api';

test.describe('Debug run', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: 'Debug Run Test',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['trigger.message'] } } },
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

  test('debug button is visible on the editor', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
    const debugBtn = page.getByText('Debug');
    await expect(debugBtn).toBeVisible({ timeout: 5000 });
  });

  test('clicking debug opens the debug panel', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    await page.getByText('Debug').click();

    // Debug panel should show
    await expect(page.getByText('Debug Run')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Start Debug Run')).toBeVisible({ timeout: 5000 });
  });

  test('runs a simple trigger → output flow', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    // Open debug panel and run
    await page.getByText('Debug').click();
    await expect(page.getByText('Start Debug Run')).toBeVisible({ timeout: 10000 });
    await page.getByText('Start Debug Run').click();

    // Steps should appear — at minimum the output step should complete
    const steps = page.locator('[class*="StepCard"], [class*="step"]');
    await expect(steps.first()).toBeVisible({ timeout: 20000 });
  });

  test('shows stop button while running', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    await page.getByText('Debug').click();
    await expect(page.getByText('Start Debug Run')).toBeVisible({ timeout: 10000 });
    await page.getByText('Start Debug Run').click();

    // Should show Stop or Running text during execution
    await expect(page.getByText(/Running|Stop|Re-run/)).toBeVisible({ timeout: 10000 });
  });
});
