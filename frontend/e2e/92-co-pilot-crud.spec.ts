import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Co-Pilot CRUD tools', () => {
  // ── LLM Endpoints ─────────────────────────────────────────────

  test('list_endpoints returns endpoint list', async ({ request }) => {
    const res = await request.get(`${API_URL}/llm-endpoints`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('create_endpoint adds a new endpoint then delete_endpoint removes it', async ({ request }) => {
    const res = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Test EP', providerType: 'openai', apiKey: 'sk-test', defaultModel: 'gpt-4' },
    });
    expect(res.ok()).toBe(true);
    const ep = await res.json();

    const delRes = await request.delete(`${API_URL}/llm-endpoints/${ep.id}`);
    expect(delRes.ok()).toBe(true);
  });

  // ── MCP Servers ───────────────────────────────────────────────

  test('list_mcp_servers returns server list', async ({ request }) => {
    const res = await request.get(`${API_URL}/mcp-servers`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('create_mcp_server and delete_mcp_server work', async ({ request }) => {
    const res = await request.post(`${API_URL}/mcp-servers`, {
      data: { name: 'E2E Test MCP', url: 'http://e2e-test:9999/sse' },
    });
    expect(res.ok()).toBe(true);
    const server = await res.json();

    const delRes = await request.delete(`${API_URL}/mcp-servers/${server.id}`);
    expect(delRes.ok()).toBe(true);
  });

  // ── Embedding Providers ───────────────────────────────────────

  test('list_embedding_providers returns list', async ({ request }) => {
    const res = await request.get(`${API_URL}/embedding-providers`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('create and delete embedding provider', async ({ request }) => {
    const res = await request.post(`${API_URL}/embedding-providers`, {
      data: { name: 'E2E Test Embedding', providerType: 'openai', apiKey: 'sk-test' },
    });
    expect(res.ok()).toBe(true);
    const ep = await res.json();

    const delRes = await request.delete(`${API_URL}/embedding-providers/${ep.id}`);
    expect(delRes.ok()).toBe(true);
  });

  // ── Vector Stores ─────────────────────────────────────────────

  test('list_vector_stores returns list', async ({ request }) => {
    const res = await request.get(`${API_URL}/vector-stores`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('create and delete vector store', async ({ request }) => {
    const res = await request.post(`${API_URL}/vector-stores`, {
      data: { name: 'E2E Test Store', storeType: 'qdrant', url: 'http://qdrant-e2e:6333' },
    });
    expect(res.ok()).toBe(true);
    const vs = await res.json();

    const delRes = await request.delete(`${API_URL}/vector-stores/${vs.id}`);
    expect(delRes.ok()).toBe(true);
  });

  // ── Users (admin CRUD) ────────────────────────────────────────

  test('list_users returns user list', async ({ request }) => {
    const res = await request.get(`${API_URL}/users`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('create_user, list, delete_user and update_user_role work', async ({ request }) => {
    // Create
    const createRes = await request.post(`${API_URL}/users`, {
      data: { email: 'e2e-crud@test.local', password: 'Test1234!', name: 'E2E CRUD User' },
    });
    expect(createRes.ok()).toBe(true);
    const user = await createRes.json();

    // List should include the new user
    const listRes = await request.get(`${API_URL}/users`);
    const users = await listRes.json();
    expect(users.some((u: any) => u.id === user.id)).toBe(true);

    // Get roles
    const rolesRes = await request.get(`${API_URL}/roles`);
    const roles = await rolesRes.json();
    const approverRole = roles.find((r: any) => r.name === 'approver');
    expect(approverRole).toBeDefined();

    // Update role
    const roleRes = await request.put(`${API_URL}/users/${user.id}/role`, {
      data: { role_id: approverRole.id },
    });
    expect(roleRes.ok()).toBe(true);

    // Delete
    const delRes = await request.delete(`${API_URL}/users/${user.id}`);
    expect(delRes.ok()).toBe(true);
  });

  // ── Executions ────────────────────────────────────────────────

  test('list_executions returns execution list', async ({ request }) => {
    const res = await request.get(`${API_URL}/executions`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  // ── Roles ─────────────────────────────────────────────────────

  test('list_roles returns role list', async ({ request }) => {
    const res = await request.get(`${API_URL}/roles`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  // ── Profile ───────────────────────────────────────────────────

  test('update_profile works', async ({ request }) => {
    const res = await request.put(`${API_URL}/auth/profile`, {
      data: { name: 'E2E Updated Name' },
    });
    expect(res.ok()).toBe(true);

    // Verify
    const profileRes = await request.get(`${API_URL}/auth/profile`);
    const profile = await profileRes.json();
    expect(profile.name).toBe('E2E Updated Name');

    // Restore
    await request.put(`${API_URL}/auth/profile`, {
      data: { name: 'E2E Test User' },
    });
  });

  // ── Flow listing ──────────────────────────────────────────────

  test('list_flows returns flow list', async ({ request }) => {
    const res = await request.get(`${API_URL}/flows`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
  });

  // ── Navigate_to tool ──────────────────────────────────────────

  test('navigate_to works via page navigation', async ({ page }) => {
    await page.goto('/settings/endpoints');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    await page.goto('/settings/mcp-servers');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    await page.goto('/approvals');
    await expect(page.getByText('Pending Approvals')).toBeVisible({ timeout: 10000 });
    await page.goto('/settings/users');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    await page.goto('/profile');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  // ── Pending approvals ─────────────────────────────────────────

  test('get_pending_approvals returns pending list', async ({ request }) => {
    const res = await request.get(`${API_URL}/executions/pending`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  // ── Search flows ──────────────────────────────────────────────

  test('search_flows returns filtered results', async ({ request }) => {
    const res = await request.get(`${API_URL}/flows?limit=100&search=E2E`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
  });
});
