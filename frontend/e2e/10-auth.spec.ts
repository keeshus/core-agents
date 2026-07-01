import { test, expect } from '@playwright/test';

test.describe('Auth flows', () => {
  test('protected /api/flows returns 401 without auth', async () => {
    const res = await fetch('http://localhost:3001/api/flows');
    expect(res.status).toBe(401);
  });

  test('protected /api/settings returns 401 without auth', async () => {
    const res = await fetch('http://localhost:3001/api/llm-endpoints');
    expect(res.status).toBe(401);
  });

  test('register page has link to login', async ({ page }) => {
    await page.goto('/register');
    const loginLink = page.getByRole('link', { name: /sign.?in/i });
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('session persists across page reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible();
  });
});
