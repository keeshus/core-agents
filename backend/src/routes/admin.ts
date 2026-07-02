import { Router } from 'express';
import bcrypt from 'bcrypt';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, roles, groups, groupMembers } from '../db/schema.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.use(authenticate);

// POST /api/users — create a user (admin only). Allows setting role_id.
router.post('/users', requirePermission('admin'), asyncHandler(async (req, res) => {
  const { email, password, name, role_id } = req.body || {};
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password, and name are required' });
    return;
  }
  const password_hash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(users).values({ email, password_hash, name, role_id: role_id || null }).returning();
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role_id: user.role_id });
}));

// POST /api/admin/seed-roles — create default roles if they don't exist
router.post('/roles/seed', requirePermission('admin'), asyncHandler(async (_req, res) => {
  const defaults = [
    {
      name: 'admin', description: 'Full system access', is_system: true,
      permissions: [
        'admin', 'flow:create', 'flow:edit', 'flow:delete', 'flow:read',
        'endpoint:read', 'endpoint:write',
        'mcp:read', 'mcp:write',
        'embedding:read', 'embedding:write',
        'store:read', 'store:write',
        'document:write', 'knowledge:write',
        'chat:create', 'execution:approve',
        'group:read', 'group:write',
        'secrets:read', 'secrets:write', 'secrets:read_app', 'secrets:write_app',
        'secrets:read_group', 'secrets:write_group',
        'secrets:rotate', 'secrets:audit',
        'vaults:read', 'vaults:write',
        'groups:manage',
      ],
    },
    {
      name: 'editor', description: 'Can create and edit flows', is_system: true,
      permissions: [
        'flow:create', 'flow:edit', 'flow:read',
        'execution:approve',
        'endpoint:read', 'mcp:read', 'embedding:read', 'store:read',
        'document:write', 'knowledge:write', 'chat:create',
        'group:read',
      ],
    },
    {
      name: 'reader', description: 'Can approve Human-in-the-Loop requests', is_system: true,
      permissions: [
        'execution:approve',
      ],
    },
    {
      name: 'group_admin', description: 'Can manage group members, vault bindings, and group secrets', is_system: true,
      permissions: [
        'secrets:read_group', 'secrets:write_group',
        'vaults:read',
        'group:read', 'groups:manage',
        'flow:read', 'flow:create', 'flow:edit',
        'execution:approve', 'chat:create',
      ],
    },
  ];

  const created: string[] = [];
  for (const role of defaults) {
    const [existing] = await db.select().from(roles).where(eq(roles.name, role.name));
    if (!existing) {
      await db.insert(roles).values(role);
      created.push(role.name);
    }
  }

  res.json({ status: 'ok', created });
}));

// GET /api/admin/roles — list all roles
router.get('/roles', requirePermission('admin'), asyncHandler(async (_req, res) => {
  const all = await db.select().from(roles);
  res.json(all);
}));

// GET /api/users — list all users with roles and groups
router.get('/users', requirePermission('admin'), asyncHandler(async (_req, res) => {
  const all = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      provider: users.provider,
      is_active: users.is_active,
      role_id: users.role_id,
      role_name: roles.name,
      last_login_at: users.last_login_at,
      created_at: users.created_at,
    })
    .from(users)
    .leftJoin(roles, eq(users.role_id, roles.id))
    .orderBy(desc(users.created_at));

  // Enrich with group memberships
  const allMemberships = await db
    .select({
      userId: groupMembers.user_id,
      groupId: groups.id,
      groupName: groups.name,
      groupProvider: groups.provider,
    })
    .from(groupMembers)
    .leftJoin(groups, eq(groupMembers.group_id, groups.id));

  const groupsByUser: Record<string, Array<{ id: string; name: string; provider: string }>> = {};
  for (const m of allMemberships) {
    if (!m.groupId || !m.groupName) continue;
    if (!groupsByUser[m.userId]) groupsByUser[m.userId] = [];
    groupsByUser[m.userId].push({ id: m.groupId, name: m.groupName, provider: m.groupProvider || 'local' });
  }

  const enriched = all.map(u => ({
    ...u,
    groups: groupsByUser[u.id] || [],
  }));

  res.json(enriched);
}));

// DELETE /api/admin/users/:id — delete a user (admin only)
router.delete('/users/:id', requirePermission('admin'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  await db.delete(users).where(eq(users.id, id));
  res.json({ status: 'deleted' });
}));

// PUT /api/admin/users/:id/role — update a user's role
router.put('/users/:id/role', requirePermission('admin'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const { role_id } = req.body || {};
  await db.update(users).set({ role_id }).where(eq(users.id, id));
  res.json({ status: 'updated' });
}));

// PUT /api/admin/users/:id/groups — update a user's group memberships
router.put('/users/:id/groups', requirePermission('admin'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const { groupIds } = req.body || {};
  if (!Array.isArray(groupIds)) { res.status(400).json({ error: 'groupIds must be an array' }); return; }

  // Remove existing local group memberships for this user
  const localGroups = await db.select({ id: groups.id }).from(groups).where(eq(groups.provider, 'local'));
  const localGroupIds = localGroups.map(g => g.id);
  if (localGroupIds.length > 0) {
    await db.delete(groupMembers).where(
      and(eq(groupMembers.user_id, id), inArray(groupMembers.group_id, localGroupIds))
    );
  }

  // Add new ones
  for (const groupId of groupIds) {
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
    if (group && group.provider === 'local') {
      await db.insert(groupMembers).values({ group_id: groupId, user_id: id }).onConflictDoNothing();
    }
  }

  res.json({ status: 'updated' });
}));

// PUT /api/admin/groups/:id/members/:userId/role — update member's group role
router.put('/groups/:id/members/:userId/role', requirePermission('admin', 'groups:manage'), asyncHandler(async (req, res) => {
  const groupId = req.params.id as string;
  const userId = req.params.userId as string;
  const { role } = req.body || {};
  if (!role || !['member', 'admin'].includes(role)) { res.status(400).json({ error: 'role must be "member" or "admin"' }); return; }

  const [membership] = await db.select().from(groupMembers).where(
    and(eq(groupMembers.group_id, groupId), eq(groupMembers.user_id, userId))
  );
  if (!membership) { res.status(404).json({ error: 'Membership not found' }); return; }

  await db.update(groupMembers).set({ role }).where(eq(groupMembers.id, membership.id));
  res.json({ status: 'updated' });
}));

export default router;
