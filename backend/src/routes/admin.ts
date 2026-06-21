import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, roles } from '../db/schema.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.use(authenticate);

// POST /api/admin/seed-roles — create default roles if they don't exist
router.post('/roles/seed', requirePermission('admin'), asyncHandler(async (_req, res) => {
  const defaults = [
    {
      name: 'admin', description: 'Full system access', is_system: true,
      permissions: [
        'admin', 'flow:create', 'flow:edit', 'flow:delete',
        'endpoint:read', 'endpoint:write',
        'mcp:read', 'mcp:write',
        'embedding:read', 'embedding:write',
        'store:read', 'store:write',
        'document:write', 'knowledge:write',
        'chat:create', 'execution:approve',
      ],
    },
    {
      name: 'editor', description: 'Can create and edit flows', is_system: true,
      permissions: [
        'flow:create', 'flow:edit', 'execution:approve',
        'endpoint:read', 'mcp:read', 'embedding:read', 'store:read',
        'document:write', 'knowledge:write', 'chat:create',
      ],
    },
    { name: 'approver', description: 'Can approve Human-in-the-Loop requests', permissions: ['execution:approve'], is_system: true },
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

// GET /api/users — list all users with roles
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
  res.json(all);
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

export default router;
