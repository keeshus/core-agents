import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { secretVaults, groupVaultConfig } from '../db/schema.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { encrypt, decrypt, ensureInitialKeyVersion } from '../utils/encryption.js';
import { testConnection } from '../services/cyberark.js';

const router = Router();
router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

function sanitizeVault(vault: any) {
  const { client_id, client_secret, ...safe } = vault;
  return { ...safe, hasClientId: !!client_id, hasClientSecret: !!client_secret };
}

// GET /api/secret-vaults
router.get('/', requirePermission('vaults:read'), asyncHandler(async (_req, res) => {
  const rows = await db.select().from(secretVaults).orderBy(secretVaults.created_at);
  res.json(rows.map(sanitizeVault));
}));

// POST /api/secret-vaults
router.post('/', requirePermission('vaults:write'), asyncHandler(async (req, res) => {
  const { name, vaultType = 'cyberark', baseUrl, authType = 'client_credentials', clientId, clientSecret, caCert } = req.body || {};
  if (!name || !baseUrl || !clientId || !clientSecret) {
    res.status(400).json({ error: 'name, baseUrl, clientId, and clientSecret are required' }); return;
  }

  await ensureInitialKeyVersion();
  const encId = await encrypt(clientId);
  const encSecret = await encrypt(clientSecret);

  const [vault] = await db.insert(secretVaults).values({
    name,
    vault_type: vaultType,
    base_url: baseUrl,
    auth_type: authType,
    client_id: encId.encryptedValue + ':' + encId.iv + ':' + encId.tag + ':' + encId.keyVersion,
    client_secret: encSecret.encryptedValue + ':' + encSecret.iv + ':' + encSecret.tag + ':' + encSecret.keyVersion,
    ca_cert: caCert || null,
  }).returning();

  res.status(201).json(sanitizeVault(vault));
}));

// PUT /api/secret-vaults/:id
router.put('/:id', requirePermission('vaults:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  if (!isValidUUID(id)) { res.status(404).json({ error: 'Vault not found' }); return; }

  const [vault] = await db.select().from(secretVaults).where(eq(secretVaults.id, id));
  if (!vault) { res.status(404).json({ error: 'Vault not found' }); return; }

  const { name, baseUrl, authType, clientId, clientSecret, caCert } = req.body || {};
  const updates: Record<string, unknown> = {};

  if (name !== undefined) updates.name = name;
  if (baseUrl !== undefined) updates.base_url = baseUrl;
  if (authType !== undefined) updates.auth_type = authType;
  if (caCert !== undefined) updates.ca_cert = caCert || null;

  if (clientId) {
    await ensureInitialKeyVersion();
    const enc = await encrypt(clientId);
    updates.client_id = enc.encryptedValue + ':' + enc.iv + ':' + enc.tag + ':' + enc.keyVersion;
  }
  if (clientSecret) {
    await ensureInitialKeyVersion();
    const enc = await encrypt(clientSecret);
    updates.client_secret = enc.encryptedValue + ':' + enc.iv + ':' + enc.tag + ':' + enc.keyVersion;
  }

  await db.update(secretVaults).set(updates).where(eq(secretVaults.id, id));
  const [updated] = await db.select().from(secretVaults).where(eq(secretVaults.id, id));
  res.json(sanitizeVault(updated));
}));

// DELETE /api/secret-vaults/:id
router.delete('/:id', requirePermission('vaults:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  if (!isValidUUID(id)) { res.status(404).json({ error: 'Vault not found' }); return; }

  const [bound] = await db.select().from(groupVaultConfig).where(eq(groupVaultConfig.vault_id, id));
  if (bound) { res.status(409).json({ error: 'Cannot delete vault that is bound to active groups' }); return; }

  await db.delete(secretVaults).where(eq(secretVaults.id, id));
  res.json({ status: 'deleted' });
}));

// POST /api/secret-vaults/:id/test — test connection
router.post('/:id/test', requirePermission('vaults:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  if (!isValidUUID(id)) { res.status(404).json({ error: 'Vault not found' }); return; }

  const [vault] = await db.select().from(secretVaults).where(eq(secretVaults.id, id));
  if (!vault) { res.status(404).json({ error: 'Vault not found' }); return; }

  const parts = vault.client_secret.split(':');
  const clientSecret = await decrypt(parts[0], parts[1], parts[2], parseInt(parts[3]));

  const cidParts = vault.client_id.split(':');
  const clientId = await decrypt(cidParts[0], cidParts[1], cidParts[2], parseInt(cidParts[3]));

  const result = await testConnection({
    baseUrl: vault.base_url,
    clientId,
    clientSecret,
    caCert: vault.ca_cert ?? undefined,
  });

  await db.update(secretVaults).set({ is_connected: result.success }).where(eq(secretVaults.id, id));
  res.json(result);
}));

export default router;
