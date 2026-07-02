import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { groupVaultConfig, groupMembers, groups, secretVaults } from '../db/schema.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

async function isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
  const [membership] = await db.select().from(groupMembers).where(
    and(eq(groupMembers.group_id, groupId), eq(groupMembers.user_id, userId))
  );
  return membership?.role === 'admin';
}

// GET /api/group-vault-config/:groupId
router.get('/:groupId', asyncHandler(async (req, res) => {
  const groupId = req.params.groupId as string;
  if (!isValidUUID(groupId)) { res.status(404).json({ error: 'Group not found' }); return; }

  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const [membership] = await db.select().from(groupMembers).where(
    and(eq(groupMembers.group_id, groupId), eq(groupMembers.user_id, req.user!.userId))
  );
  if (!membership && !req.user!.permissions.includes('admin')) {
    res.status(403).json({ error: 'You are not a member of this group' }); return;
  }

  const [config] = await db.select().from(groupVaultConfig).where(eq(groupVaultConfig.group_id, groupId));
  if (!config) {
    res.json({ groupId, vaultId: null, vaultName: null, enabled: false });
    return;
  }

  const [vault] = await db.select({ name: secretVaults.name }).from(secretVaults).where(eq(secretVaults.id, config.vault_id));
  res.json({
    id: config.id,
    groupId: config.group_id,
    vaultId: config.vault_id,
    vaultName: vault?.name ?? null,
    enabled: config.enabled,
    createdAt: config.created_at,
    updatedAt: config.updated_at,
  });
}));

// PUT /api/group-vault-config/:groupId
router.put('/:groupId', asyncHandler(async (req, res) => {
  const groupId = req.params.groupId as string;
  if (!isValidUUID(groupId)) { res.status(404).json({ error: 'Group not found' }); return; }

  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const isAdminUser = req.user!.permissions.includes('admin') || req.user!.permissions.includes('group:write');
  const isGrpAdmin = await isGroupAdmin(groupId, req.user!.userId);

  if (!isAdminUser && !isGrpAdmin) {
    res.status(403).json({ error: 'Insufficient permissions' }); return;
  }

  const { vaultId, enabled } = req.body || {};

  if (vaultId) {
    if (!isValidUUID(vaultId)) { res.status(400).json({ error: 'Invalid vaultId' }); return; }
    const [vault] = await db.select().from(secretVaults).where(eq(secretVaults.id, vaultId));
    if (!vault) { res.status(404).json({ error: 'Vault not found' }); return; }
  }

  const [existing] = await db.select().from(groupVaultConfig).where(eq(groupVaultConfig.group_id, groupId));

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (vaultId !== undefined) updates.vault_id = vaultId;
    if (enabled !== undefined) updates.enabled = enabled;
    await db.update(groupVaultConfig).set(updates).where(eq(groupVaultConfig.group_id, groupId));
  } else {
    if (!vaultId) { res.status(400).json({ error: 'vaultId is required when creating a binding' }); return; }
    await db.insert(groupVaultConfig).values({
      group_id: groupId,
      vault_id: vaultId,
      enabled: enabled !== undefined ? enabled : true,
    });
  }

  res.json({ status: 'updated' });
}));

export default router;
