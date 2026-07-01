import { Router } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { groups, groupMembers, users } from '../db/schema.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.use(authenticate);

// GET /api/groups — list all groups with member count (requires group:read)
router.get('/', requirePermission('group:read'), asyncHandler(async (_req, res) => {
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      provider: groups.provider,
      memberCount: sql<number>`(SELECT COUNT(*) FROM ${groupMembers} WHERE ${groupMembers.group_id} = ${groups.id})`,
      created_at: groups.created_at,
    })
    .from(groups)
    .orderBy(desc(groups.created_at));
  res.json(rows);
}));

// GET /api/groups/:id — single group with members
router.get('/:id', requirePermission('group:read'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }
  const members = await db
    .select({
      id: groupMembers.id,
      userId: groupMembers.user_id,
      name: users.name,
      email: users.email,
    })
    .from(groupMembers)
    .leftJoin(users, eq(groupMembers.user_id, users.id))
    .where(eq(groupMembers.group_id, id));
  res.json({ ...group, members });
}));

// POST /api/groups — create a local group (requires group:write)
router.post('/', requirePermission('group:write'), asyncHandler(async (req, res) => {
  const { name, description = '' } = req.body || {};
  if (!name || !name.trim()) { res.status(400).json({ error: 'Group name is required' }); return; }
  const [existing] = await db.select().from(groups).where(eq(groups.name, name.trim()));
  if (existing) { res.status(409).json({ error: 'A group with this name already exists' }); return; }
  const [group] = await db.insert(groups).values({ name: name.trim(), description, provider: 'local' }).returning();
  res.status(201).json(group);
}));

// PUT /api/groups/:id — update group name/description (local groups only)
router.put('/:id', requirePermission('group:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const { name, description } = req.body || {};
  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }
  if (group.provider !== 'local') { res.status(403).json({ error: 'Cannot edit SSO-provisioned groups' }); return; }
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  const [updated] = await db.update(groups).set(updates).where(eq(groups.id, id)).returning();
  res.json(updated);
}));

// DELETE /api/groups/:id — delete group (local groups only)
router.delete('/:id', requirePermission('group:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }
  if (group.provider !== 'local') { res.status(403).json({ error: 'Cannot delete SSO-provisioned groups' }); return; }
  await db.delete(groupMembers).where(eq(groupMembers.group_id, id));
  await db.delete(groups).where(eq(groups.id, id));
  res.json({ status: 'deleted' });
}));

// POST /api/groups/:id/members — add member to group (local groups only)
router.post('/:id/members', requirePermission('group:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const { userId } = req.body || {};
  if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }
  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }
  if (group.provider !== 'local') { res.status(403).json({ error: 'Cannot modify SSO-provisioned group membership' }); return; }
  const [existing] = await db.select().from(groupMembers).where(and(eq(groupMembers.group_id, id), eq(groupMembers.user_id, userId)));
  if (existing) { res.status(409).json({ error: 'User is already a member' }); return; }
  const [member] = await db.insert(groupMembers).values({ group_id: id, user_id: userId }).returning();
  res.status(201).json(member);
}));

// DELETE /api/groups/:id/members/:userId — remove member (local groups only)
router.delete('/:id/members/:userId', requirePermission('group:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const userId = req.params.userId as string;
  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }
  if (group.provider !== 'local') { res.status(403).json({ error: 'Cannot modify SSO-provisioned group membership' }); return; }
  await db.delete(groupMembers).where(and(eq(groupMembers.group_id, id), eq(groupMembers.user_id, userId)));
  res.json({ status: 'removed' });
}));

export default router;
