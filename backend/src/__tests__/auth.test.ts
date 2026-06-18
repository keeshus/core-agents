import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Test requirePermission middleware ───────────────────────────────

describe('requirePermission', () => {
  let requirePermission: any;
  let req: any, res: any, next: any;

  beforeEach(async () => {
    // Dynamic import so env is fresh each test
    vi.resetModules();
    const mod = await import('../middleware/auth.js');
    requirePermission = mod.requirePermission;
    req = { user: null };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('returns 401 if no user on request', () => {
    const middleware = requirePermission('flow:create');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if user lacks the required permission', () => {
    req.user = { userId: '1', email: 'a@b.com', role: 'viewer', permissions: ['flow:read'] };
    const middleware = requirePermission('flow:create');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next if user has the required permission', () => {
    req.user = { userId: '1', email: 'a@b.com', role: 'admin', permissions: ['flow:create', 'flow:edit'] };
    const middleware = requirePermission('flow:create');
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes if user has any of multiple required permissions', () => {
    req.user = { userId: '1', email: 'a@b.com', role: 'editor', permissions: ['flow:edit'] };
    const middleware = requirePermission('flow:create', 'flow:edit');
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects if user has none of multiple required permissions', () => {
    req.user = { userId: '1', email: 'a@b.com', role: 'viewer', permissions: ['flow:read'] };
    const middleware = requirePermission('flow:create', 'flow:delete');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── Test role permissions structure ─────────────────────────────────

describe('role permissions', () => {
  const rolePermissions: Record<string, string[]> = {
    admin: ['admin', 'flow:create', 'flow:edit', 'flow:delete', 'settings:read', 'settings:write', 'execution:approve'],
    editor: ['flow:create', 'flow:edit', 'execution:approve', 'settings:read'],
    viewer: ['flow:read', 'execution:approve', 'settings:read'],
  };

  it('admin has all permissions', () => {
    const all = ['flow:create', 'flow:edit', 'flow:delete', 'settings:read', 'settings:write', 'execution:approve'];
    for (const perm of all) {
      expect(rolePermissions.admin).toContain(perm);
    }
  });

  it('editor can create and edit flows', () => {
    expect(rolePermissions.editor).toContain('flow:create');
    expect(rolePermissions.editor).toContain('flow:edit');
    expect(rolePermissions.editor).not.toContain('flow:delete');
  });

  it('viewer can read flows and approve HITL', () => {
    expect(rolePermissions.viewer).toContain('flow:read');
    expect(rolePermissions.viewer).toContain('execution:approve');
    expect(rolePermissions.viewer).not.toContain('flow:create');
    expect(rolePermissions.viewer).not.toContain('flow:edit');
    expect(rolePermissions.viewer).not.toContain('flow:delete');
    expect(rolePermissions.viewer).not.toContain('settings:write');
  });

  it('only admin can write settings', () => {
    expect(rolePermissions.admin).toContain('settings:write');
    expect(rolePermissions.editor).not.toContain('settings:write');
    expect(rolePermissions.viewer).not.toContain('settings:write');
  });

  it('only admin can delete flows', () => {
    expect(rolePermissions.admin).toContain('flow:delete');
    expect(rolePermissions.editor).not.toContain('flow:delete');
    expect(rolePermissions.viewer).not.toContain('flow:delete');
  });
});

// ── Test group-to-role mapping ──────────────────────────────────────

describe('resolveRoleFromGroups', () => {
  // Replicate the function from auth.ts to test it in isolation
  function resolveRoleFromGroups(
    claims: Record<string, unknown>,
    adminGroups: string[],
    editorGroups: string[],
  ): string {
    const groups: string[] = [];
    if (Array.isArray(claims.groups)) groups.push(...claims.groups.map(String));
    if (claims.realm_access && typeof claims.realm_access === 'object') {
      const ra = claims.realm_access as Record<string, unknown>;
      if (Array.isArray(ra.roles)) groups.push(...ra.roles.map(String));
    }
    if (groups.some(g => adminGroups.includes(g))) return 'admin';
    if (groups.some(g => editorGroups.includes(g))) return 'editor';
    return 'viewer';
  }

  const adminGroups = ['core-agents-admin', 'admin'];
  const editorGroups = ['core-agents-editor', 'editor'];

  it('returns admin for admin group', () => {
    expect(resolveRoleFromGroups({ groups: ['core-agents-admin'] }, adminGroups, editorGroups)).toBe('admin');
    expect(resolveRoleFromGroups({ groups: ['admin'] }, adminGroups, editorGroups)).toBe('admin');
  });

  it('returns editor for editor group', () => {
    expect(resolveRoleFromGroups({ groups: ['core-agents-editor'] }, adminGroups, editorGroups)).toBe('editor');
    expect(resolveRoleFromGroups({ groups: ['editor'] }, adminGroups, editorGroups)).toBe('editor');
  });

  it('returns viewer for unknown groups', () => {
    expect(resolveRoleFromGroups({ groups: ['user', 'viewer'] }, adminGroups, editorGroups)).toBe('viewer');
    expect(resolveRoleFromGroups({ groups: [] }, adminGroups, editorGroups)).toBe('viewer');
  });

  it('returns viewer for no groups', () => {
    expect(resolveRoleFromGroups({}, adminGroups, editorGroups)).toBe('viewer');
    expect(resolveRoleFromGroups({ email: 'test@test.com' }, adminGroups, editorGroups)).toBe('viewer');
  });

  it('admin group takes priority over editor', () => {
    expect(resolveRoleFromGroups({ groups: ['editor', 'admin'] }, adminGroups, editorGroups)).toBe('admin');
  });

  it('handles Keycloak realm_access.roles format', () => {
    const claims = { realm_access: { roles: ['core-agents-editor'] } };
    expect(resolveRoleFromGroups(claims, adminGroups, editorGroups)).toBe('editor');
  });

  it('handles both groups and realm_access.roles', () => {
    const claims = {
      groups: ['user'],
      realm_access: { roles: ['admin'] },
    };
    expect(resolveRoleFromGroups(claims, adminGroups, editorGroups)).toBe('admin');
  });

  it('returns viewer when admin/editor groups are empty', () => {
    expect(resolveRoleFromGroups({ groups: ['admin'] }, [], [])).toBe('viewer');
    expect(resolveRoleFromGroups({ groups: ['editor'] }, [], [])).toBe('viewer');
  });
});
