import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('SSO with mock OIDC', () => {
  test.beforeEach(async ({ request }) => {
    // Configure SSO with mock OIDC before each test
    const res = await request.put(`${API_URL}/admin/sso-config`, {
      data: {
        provider: 'mock-oidc',
        clientId: 'core-agents',
        clientSecret: 'e2e-test-secret',
        issuer: 'http://mock-oidc-e2e:3004/dex',
        redirectUri: 'http://localhost:3001/api/auth/sso/callback',
        groupClaim: 'groups',
        adminGroupMapping: ['core-agents-admin'],
        editorGroupMapping: ['core-agents-editor'],
        enabled: true,
      },
    });
    expect(res.ok()).toBe(true);
  });

  test.afterEach(async ({ request }) => {
    await request.put(`${API_URL}/admin/sso-config`, {
      data: { enabled: false },
    });
  });

  // ─── Page visibility ─────────────────────────────────

  test('login page shows SSO button when configured', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Sign in with SSO')).toBeVisible({ timeout: 10000 });
  });

  test('login page hides SSO button when disabled', async ({ request, page }) => {
    await request.put(`${API_URL}/admin/sso-config`, {
      data: { enabled: false },
    });
    await page.goto('/login');
    await expect(page.getByText('Sign in with SSO')).not.toBeVisible({ timeout: 5000 });
  });

  // ─── Role mapping via DeX group claims ───────────────

  test('SSO login as admin gets admin role', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();

    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();

    // Admin user is part of 'core-agents-admin' group → mapped to admin role
    await expect(page).toHaveURL(/localhost:3000/);
    await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible({ timeout: 10000 });

    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    expect(me.user?.role).toBe('admin');
    expect(me.user?.permissions).toContain('group:write');

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  test('SSO login as editor gets editor role', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('editor@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();

    // Editor user is part of 'core-agents-editor' group → mapped to editor role
    await expect(page).toHaveURL(/localhost:3000/);

    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    expect(me.user?.role).toBe('editor');
    expect(me.user?.permissions).toContain('flow:create');
    expect(me.user?.permissions).not.toContain('group:write');

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  test('SSO login as reader (unmapped group) gets reader role', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('reader@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();

    // Reader is in 'some-other-group' which doesn't match admin or editor mapping
    await expect(page).toHaveURL(/\/approvals/);

    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    expect(me.user?.role).toBe('reader');

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  test('SSO login as no-group user gets reader role', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('nogroup@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();

    // No groups → reader role
    await expect(page).toHaveURL(/\/approvals/);

    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    expect(me.user?.role).toBe('reader');

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  // ─── Group sync ──────────────────────────────────────

  test('SSO login syncs groups from userinfo', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();
    await expect(page).toHaveURL(/localhost:3000/);

    // Verify synced groups in /auth/me
    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    const groupNames = (me.user?.groups || []).map((g: any) => g.name);
    expect(groupNames).toContain('core-agents-admin');

    // Verify group exists in DB with provider=mock-oidc
    const groupsRes = await request.get(`${API_URL}/groups`);
    const groups = await groupsRes.json();
    const syncedGroup = groups.find((g: any) => g.name === 'core-agents-admin');
    expect(syncedGroup).toBeDefined();
    expect(syncedGroup.provider).toBe('mock-oidc');

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  // ─── Re-login ────────────────────────────────────────

  test('SSO re-login preserves existing user', async ({ page, request }) => {
    // First login
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();
    await expect(page).toHaveURL(/localhost:3000/);

    const me1 = await (await page.request.get(`${API_URL}/auth/me`)).json();
    const userId = me1.user?.userId;

    // Logout by clearing cookie
    await page.goto('/login');

    // Second login
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();
    await expect(page).toHaveURL(/localhost:3000/);

    const me2 = await (await page.request.get(`${API_URL}/auth/me`)).json();
    expect(me2.user?.userId).toBe(userId);
    expect(me2.user?.role).toBe('admin');

    await request.delete(`${API_URL}/users/${userId}`).catch(() => {});
  });
});
