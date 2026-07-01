import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { ssoConfig } from '../db/schema.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.use(authenticate);

function maskSecret(val: string): string {
  if (!val || val.length < 8) return val;
  return val.slice(0, 4) + '••••' + val.slice(-4);
}

// GET /api/admin/sso-config — get current config (secret masked)
router.get('/', requirePermission('admin'), asyncHandler(async (_req, res) => {
  let [config] = await db.select().from(ssoConfig).where(eq(ssoConfig.id, 1));
  if (!config) {
    res.json({
      id: 1, provider: '', clientId: '', clientSecret: '',
      issuer: '', redirectUri: 'http://localhost:3001/api/auth/sso/callback',
      groupClaim: 'groups', adminGroupMapping: [], editorGroupMapping: [],
      enabled: false, updatedAt: null,
    });
    return;
  }
  res.json({
    ...config,
    clientSecret: maskSecret(config.client_secret),
  });
}));

// PUT /api/admin/sso-config — update config
router.put('/', requirePermission('admin'), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (body.provider !== undefined) updates.provider = body.provider;
  if (body.clientId !== undefined) updates.client_id = body.clientId;
  if (body.clientSecret !== undefined && !body.clientSecret.includes('••••')) {
    updates.client_secret = body.clientSecret;
  }
  if (body.issuer !== undefined) updates.issuer = body.issuer;
  if (body.redirectUri !== undefined) updates.redirect_uri = body.redirectUri;
  if (body.groupClaim !== undefined) updates.group_claim = body.groupClaim;
  if (body.adminGroupMapping !== undefined) updates.admin_group_mapping = body.adminGroupMapping;
  if (body.editorGroupMapping !== undefined) updates.editor_group_mapping = body.editorGroupMapping;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  // Upsert — ensure row with id=1 exists
  await db.insert(ssoConfig).values({ id: 1, ...updates } as any)
    .onConflictDoUpdate({ target: ssoConfig.id, set: updates as any });

  const [config] = await db.select().from(ssoConfig).where(eq(ssoConfig.id, 1));
  res.json({ ...config, clientSecret: maskSecret(config.client_secret) });
}));

export default router;
