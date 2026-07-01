import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow } from './helpers/api';

test.describe('Flow editor', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, { name: 'Editor Test Flow' });
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
  });

  test.afterEach(async ({ request }) => {
    if (flowId) {
      await deleteFlow(request, flowId).catch(() => {});
    }
  });

  test('canvas renders', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
  });

  test('add node button is visible', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
    const addBtn = page.locator('#add-node-btn');
    await expect(addBtn).toBeVisible({ timeout: 5000 });
  });

  test('opens node catalog when clicking + button', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    // Click the Add Node button
    await page.locator('#add-node-btn').click();
    await page.waitForTimeout(1000);

    // Catalog panel should show "Add Node" heading
    await expect(page.getByRole('heading', { name: 'Add Node' })).toBeVisible({ timeout: 5000 });
  });

  test('adds nodes from catalog', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    // Open catalog and add Trigger
    await page.locator('#add-node-btn').click();
    await page.waitForTimeout(1000);

    // Wait for catalog data to load
    const triggerBtn = page.getByRole('button', { name: 'Trigger' });
    await expect(triggerBtn).toBeVisible({ timeout: 10000 });
    await triggerBtn.click();
    await page.waitForTimeout(500);

    // A node should appear
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
  });

  test('adds multiple nodes', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    // Add Trigger
    await page.locator('#add-node-btn').click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Trigger' }).click();
    await page.waitForTimeout(500);

    // Add Output
    await page.locator('#add-node-btn').click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Output' }).click();
    await page.waitForTimeout(500);

    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
  });

  test('selects a node by clicking it', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    // Add a trigger node
    await page.locator('#add-node-btn').click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Trigger' }).click();
    await page.waitForTimeout(500);

    // Click the node
    const node = page.locator('.react-flow__node').first();
    await node.click();
    await page.waitForTimeout(500);

    await expect(node).toHaveClass(/selected/, { timeout: 3000 });
  });

  test('deletes a node with keyboard', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    // Add a trigger node
    await page.locator('#add-node-btn').click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Trigger' }).click();
    await page.waitForTimeout(500);

    // Click the node to select it, then click the canvas to give it focus
    await page.locator('.react-flow__node').first().click();
    await page.locator('.react-flow__pane, .react-flow').first().click({ position: { x: 0, y: 0 } });
    await page.waitForTimeout(300);

    // Press Backspace (React Flow default delete key)
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    await expect(page.locator('.react-flow__node')).toHaveCount(0);
  });

  test('displays nodes loaded from a saved flow', async ({ page, request }) => {
    const fullFlow = await createFlow(request, {
      name: 'Pre-populated Flow',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'My Trigger', type: 'trigger', config: {} } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'My Output', type: 'output', config: {} } },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'o1' }],
    });
    const flow = await fullFlow.json();
    await page.goto(`/flows/${flow.id}/edit`);

    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 15000 });
    await expect(page.getByText('My Trigger')).toBeVisible();
    await expect(page.getByText('My Output')).toBeVisible();

    await deleteFlow(request, flow.id);
  });
});
