import { test, expect } from '@playwright/test';
import { E2E_USER } from './helpers/api';

const API_URL = 'http://localhost:3001/api';

test.describe('Initial Setup — fresh install', () => {
  test('navigating to / redirects to /setup when no users exist', async ({ page }) => {
    const res = await page.request.get(`${API_URL}/auth/setup-status`);
    const { required } = await res.json();
    test.skip(!required, 'Setup already completed — skipping fresh-install tests');

    await page.goto('/');
    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByText('Welcome to Core Agents')).toBeVisible();
  });

  test('shows error from backend on empty submit', async ({ page }) => {
    const res = await page.request.get(`${API_URL}/auth/setup-status`);
    const { required } = await res.json();
    test.skip(!required, 'Setup already completed — skipping fresh-install tests');

    await page.goto('/setup');
    await expect(page.getByLabel('Name')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Create Admin Account' }).click();
    await expect(page.getByText(/Email.*required|password.*required|name.*required/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows error for short password', async ({ page }) => {
    const res = await page.request.get(`${API_URL}/auth/setup-status`);
    const { required } = await res.json();
    test.skip(!required, 'Setup already completed — skipping fresh-install tests');

    await page.goto('/setup');
    await expect(page.getByLabel('Name')).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Name').fill('Admin');
    await page.getByLabel('Email').fill('admin@test.local');
    await page.getByLabel('Password', { exact: true }).fill('123');
    await page.getByRole('button', { name: 'Create Admin Account' }).click();
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
  });

  test('registers first admin user and saves auth state', async ({ page, context }) => {
    const res = await page.request.get(`${API_URL}/auth/setup-status`);
    const { required } = await res.json();

    if (!required) {
      // Already has a user — login with existing credentials
      await page.goto('/login');
      await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10000 });
      await page.getByLabel('Email').fill(E2E_USER.email);
      await page.getByLabel('Password', { exact: true }).fill(E2E_USER.password);
      await page.getByRole('button', { name: /sign.?in/i }).click();
      await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible();

      // Verify admin role via profile endpoint (reads from DB)
      const profileRes = await page.request.get(`${API_URL}/auth/profile`);
      expect(profileRes.ok()).toBe(true);
      const profile = await profileRes.json();
      expect(profile.role.name).toBe('admin');

      await context.storageState({ path: 'e2e/.auth/user.json' });
      return;
    }

    // Fresh DB — register as first admin
    await page.goto('/setup');
    await expect(page.getByLabel('Name')).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Name').fill(E2E_USER.name);
    await page.getByLabel('Email').fill(E2E_USER.email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_USER.password);
    await page.getByLabel('Confirm Password').fill(E2E_USER.password);
    await page.getByRole('button', { name: 'Create Admin Account' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible();

    // Verify admin role via profile endpoint (reads from DB)
    const profileRes = await page.request.get(`${API_URL}/auth/profile`);
    expect(profileRes.ok()).toBe(true);
    const profile = await profileRes.json();
    expect(profile.role.name).toBe('admin');

    await context.storageState({ path: 'e2e/.auth/user.json' });
  });
});
