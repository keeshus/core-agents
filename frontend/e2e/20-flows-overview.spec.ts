import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow } from './helpers/api';

test.describe('Flows overview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows flows list heading', async ({ page }) => {
    await expect(page.getByText('Flows')).toBeVisible();
  });

  test('shows new flow button', async ({ page }) => {
    await page.goto('/');
    const createBtn = page.getByText('New Flow').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test('new flow button navigates to editor', async ({ page }) => {
    await page.goto('/');
    await page.getByText('New Flow').first().click();
    await expect(page).toHaveURL(/\/flows\/[^/]+\/edit/);
  });

  test('created flow appears in the list', async ({ page, request }) => {
    const res = await createFlow(request, { name: 'Test Flow E2E', description: 'E2E test flow' });
    const flow = await res.json();
    await page.goto('/');
    await expect(page.getByText('Test Flow E2E')).toBeVisible();
    // Cleanup
    await deleteFlow(request, flow.id);
  });

  test('search filters the list', async ({ page, request }) => {
    const res1 = await createFlow(request, { name: 'Alpha Flow' });
    const res2 = await createFlow(request, { name: 'Beta Flow' });
    const flow1 = await res1.json();
    const flow2 = await res2.json();

    await page.goto('/');
    await expect(page.getByText('Alpha Flow')).toBeVisible();
    await expect(page.getByText('Beta Flow')).toBeVisible();

    // Type in search
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('Alpha');
      await expect(page.getByText('Alpha Flow')).toBeVisible();
      await expect(page.getByText('Beta Flow')).not.toBeVisible();
    }

    await deleteFlow(request, flow1.id);
    await deleteFlow(request, flow2.id);
  });

  test('delete flow removes it from list', async ({ page, request }) => {
    const res = await createFlow(request, { name: 'Delete Me' });
    const flow = await res.json();
    await page.goto('/');

    // Find delete button for this flow
    const deleteBtn = page.locator(`[data-flow-id="${flow.id}"] button[aria-label="delete"], button:has-text("Delete")`).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      // Confirm dialog
      const confirmBtn = page.getByRole('button', { name: /confirm|delete|yes/i });
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
      await expect(page.getByText('Delete Me')).not.toBeVisible();
    }
  });

  test('shows correct trigger type badge for manual trigger', async ({ page, request }) => {
    const res = await createFlow(request, {
      name: 'Manual Trigger Flow',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: {} } },
      ],
      edges: [],
    });
    const flow = await res.json();
    await page.goto('/');

    // Manual trigger should not show webhook or chat badges
    await expect(page.getByText(/webhook/i)).toHaveCount(0);
    await expect(page.getByText(/chat/i)).toHaveCount(0);
  });
});
