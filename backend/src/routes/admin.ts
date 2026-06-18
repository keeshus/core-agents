import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { roles } from '../db/schema.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.use(authenticate);

// POST /api/admin/seed-roles — create default roles if they don't exist
router.post('/seed-roles', requirePermission('admin'), asyncHandler(async (_req, res) => {
  const defaults = [
    { name: 'admin', description: 'Full system access', permissions: ['admin', 'flow:create', 'flow:edit', 'flow:delete', 'settings:read', 'settings:write', 'execution:approve'], is_system: true },
    { name: 'editor', description: 'Can create and edit flows', permissions: ['flow:create', 'flow:edit', 'execution:approve', 'settings:read'], is_system: true },
    { name: 'viewer', description: 'Read-only access, can approve HITL', permissions: ['flow:read', 'execution:approve', 'settings:read'], is_system: true },
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

export default router;
