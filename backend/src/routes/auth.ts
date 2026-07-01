import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as oidc from 'openid-client';
import { eq, sql, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, roles, ssoConfig, groups, groupMembers } from '../db/schema.js';
import { authenticate, JWT_SECRET } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// ── SSO / OIDC Configuration ──────────────────────────────────────────────

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Helper to read SSO config from DB
async function getSSOConfig() {
  const [config] = await db.select().from(ssoConfig).where(eq(ssoConfig.id, 1));
  return config || null;
}

// Determine role from resolved SSO group names
function resolveRoleFromGroups(groupNames: string[], adminMapping: string[], editorMapping: string[]): string {
  if (groupNames.some(g => adminMapping.includes(g))) return 'admin';
  if (groupNames.some(g => editorMapping.includes(g))) return 'editor';
  return 'reader';
}

async function getOidcClient(issuer: string, clientId: string, clientSecret: string) {
  const oidcConfig = await oidc.discovery(new URL(issuer), clientId, undefined, oidc.ClientSecretBasic(clientSecret));
  return oidcConfig;
}

// Decode JWT payload without verification (the id_token is already verified by the callback)
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return {};
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

// ── GET /api/auth/config — return available auth methods ──────────────────

router.get('/config', asyncHandler(async (_req, res) => {
  const config = await getSSOConfig();
  const ssoConfigured = !!(config && config.enabled && config.provider && config.client_id && config.client_secret && config.issuer);
  res.json({
    providers: ssoConfigured ? ['local', config!.provider] : ['local'],
    sso: ssoConfigured ? { provider: config!.provider, name: config!.provider === 'keycloak' ? 'Keycloak' : 'SSO' } : null,
  });
}));

// ── GET /api/auth/sso/login — redirect to OIDC provider ───────────────────

router.get('/sso/login', asyncHandler(async (_req, res) => {
  const config = await getSSOConfig();
  if (!config || !config.enabled) {
    res.status(400).json({ error: 'SSO not configured' });
    return;
  }
  try {
    const oidcClient = await getOidcClient(config.issuer, config.client_id, config.client_secret);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const authUrl = oidc.buildAuthorizationUrl(oidcClient, {
      scope: 'openid email profile',
      state,
      nonce,
      redirect_uri: config.redirect_uri,
    });
    res.cookie('sso_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 5 * 60 * 1000 });
    res.cookie('sso_nonce', nonce, { httpOnly: true, sameSite: 'lax', maxAge: 5 * 60 * 1000 });
    res.redirect(String(authUrl));
  } catch (err) {
    console.error('SSO login error:', err);
    res.status(500).json({ error: 'Failed to initiate SSO login' });
  }
}));

// ── GET /api/auth/sso/callback — handle OIDC provider callback ────────────

router.get('/sso/callback', asyncHandler(async (req, res) => {
  const state = req.cookies?.sso_state;
  const nonce = req.cookies?.sso_nonce;
  if (!state || !nonce) {
    res.redirect(`${FRONTEND_URL}/login?error=missing_sso_state`);
    return;
  }

  try {
    const config = await getSSOConfig();
    if (!config || !config.enabled) {
      res.redirect(`${FRONTEND_URL}/login?error=sso_not_configured`);
      return;
    }

    const oidcClient = await getOidcClient(config.issuer, config.client_id, config.client_secret);
    const currentUrl = new URL(req.originalUrl || req.url, config.redirect_uri);
    const tokenSet = await oidc.authorizationCodeGrant(
      oidcClient, currentUrl,
      { expectedState: state, expectedNonce: nonce } as any,
      { id_token_signed_response_alg: 'RS256' },
    );

    const rawTokenSet = tokenSet as any;
    const claims = rawTokenSet.id_token ? decodeJwtPayload(rawTokenSet.id_token) : {};
    const email = String(claims.email || claims.preferred_username || '');
    const name = String(claims.name || claims.given_name || email.split('@')[0] || 'SSO User');
    const sub = String(claims.sub || '');

    if (!email && !sub) {
      res.redirect(`${FRONTEND_URL}/login?error=no_user_info`);
      return;
    }

    // Find or create user
    let [user] = await db.select().from(users).where(eq(users.provider_id, sub));
    if (!user && email) {
      [user] = await db.select().from(users).where(eq(users.email, email));
    }
    if (!user) {
      const [readerRole] = await db.select().from(roles).where(eq(roles.name, 'reader'));
      [user] = await db.insert(users).values({
        email, name, password_hash: '',
        provider: config.provider, provider_id: sub,
        role_id: readerRole?.id || null,
      }).returning();
    } else if (!user.provider_id) {
      await db.update(users).set({ provider: config.provider, provider_id: sub }).where(eq(users.id, user.id));
    }

    // Sync SSO group memberships
    const groupClaimName = config.group_claim || 'groups';
    const ssoGroupNames: string[] = [];
    if (Array.isArray(claims[groupClaimName])) {
      ssoGroupNames.push(...claims[groupClaimName].map(String));
    }
    if (groupClaimName !== 'groups' && Array.isArray(claims.groups)) {
      ssoGroupNames.push(...claims.groups.map(String));
    }
    if (claims.realm_access && typeof claims.realm_access === 'object') {
      const ra = claims.realm_access as Record<string, unknown>;
      if (Array.isArray(ra.roles)) ssoGroupNames.push(...ra.roles.map(String));
    }

    const uniqueGroupNames = [...new Set(ssoGroupNames.map((g: string) => g.trim()).filter(Boolean))];

    // Upsert groups and add user membership
    for (const groupName of uniqueGroupNames) {
      let [group] = await db.select().from(groups).where(and(eq(groups.name, groupName), eq(groups.provider, config.provider)));
      if (!group) {
        [group] = await db.insert(groups).values({ name: groupName, provider: config.provider }).returning();
      }
      const [existingMember] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.group_id, group.id), eq(groupMembers.user_id, user.id)));
      if (!existingMember) {
        await db.insert(groupMembers).values({ group_id: group.id, user_id: user.id });
      }
    }

    // Remove user from SSO-provisioned groups not in current claims
    const allUserSsoMemberships = await db.select({
      groupId: groupMembers.group_id,
      groupName: groups.name,
    }).from(groupMembers)
      .leftJoin(groups, eq(groupMembers.group_id, groups.id))
      .where(and(eq(groupMembers.user_id, user.id), eq(groups.provider, config.provider)));

    for (const membership of allUserSsoMemberships) {
      if (membership.groupName && !uniqueGroupNames.includes(membership.groupName)) {
        await db.delete(groupMembers)
          .where(and(eq(groupMembers.group_id, membership.groupId!), eq(groupMembers.user_id, user.id)));
      }
    }

    // Map groups to role using configured mappings
    const ssoRoleName = resolveRoleFromGroups(uniqueGroupNames, config.admin_group_mapping || [], config.editor_group_mapping || []);
    const [mappedRole] = await db.select().from(roles).where(eq(roles.name, ssoRoleName));
    if (mappedRole && user.role_id !== mappedRole.id) {
      await db.update(users).set({ role_id: mappedRole.id }).where(eq(users.id, user.id));
      user.role_id = mappedRole.id;
    }

    // Issue JWT
    let roleName = 'reader';
    let permissions: string[] = [];
    if (user.role_id) {
      const [role] = await db.select().from(roles).where(eq(roles.id, user.role_id));
      if (role) { roleName = role.name; permissions = role.permissions || []; }
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: roleName, permissions },
      JWT_SECRET, { expiresIn: '7d' },
    );

    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    await db.update(users).set({ last_login_at: new Date() }).where(eq(users.id, user.id));
    res.clearCookie('sso_state');
    res.clearCookie('sso_nonce');
    res.redirect(`${FRONTEND_URL}/`);
  } catch (err) {
    console.error('SSO callback error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=sso_failed`);
  }
}));

// ── GET /api/auth/setup-status — check if first-time setup is needed ──────

router.get('/setup-status', asyncHandler(async (_req, res) => {
  const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  res.json({ required: Number(count) === 0 });
}));

// ── Local auth (register / login / me / logout) ───────────────────────────

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password, and name are required' });
    return;
  }

  // Check if user exists
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, 10);

  // First user is always admin
  const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  const isFirstUser = Number(count) === 0;

  // Seed default roles if table is empty (fresh DB from drizzle-kit push)
  const [{ roleCount }] = await db.select({ roleCount: sql<number>`COUNT(*)` }).from(roles);
  if (Number(roleCount) === 0) {
    const defaultRoles = [
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
        name: 'reader', description: 'Can view flows and approve requests', is_system: true,
        permissions: [
          'flow:read', 'chat:create', 'execution:approve',
          'group:read', 'endpoint:read', 'mcp:read', 'embedding:read', 'store:read',
        ],
      },
    ];
    await db.insert(roles).values(defaultRoles);
  }

  // Get role: admin for first user, reader otherwise
  const [role] = await db.select().from(roles).where(eq(roles.name, isFirstUser ? 'admin' : 'reader'));

  // Create user
  const [user] = await db.insert(users).values({
    email,
    password_hash,
    name,
    role_id: role?.id || null,
  }).returning();

  // Generate JWT
  const rolePermissions = role?.permissions || [];
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: role?.name || 'reader', permissions: rolePermissions },
    JWT_SECRET,
    { expiresIn: '7d' },
  );

  // Set httpOnly cookie
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  await db.update(users).set({ last_login_at: new Date() }).where(eq(users.id, user.id));

  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role: role?.name || 'reader', permissions: rolePermissions },
  });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  // Get role
  let roleName = 'reader';
  let permissions: string[] = [];
  if (user.role_id) {
    const [role] = await db.select().from(roles).where(eq(roles.id, user.role_id));
    if (role) {
      roleName = role.name;
      permissions = role.permissions || [];
    }
  }

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: roleName, permissions },
    JWT_SECRET,
    { expiresIn: '7d' },
  );

  // Set httpOnly cookie
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Update last_login
  await db.update(users).set({ last_login_at: new Date() }).where(eq(users.id, user.id));

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: roleName, permissions },
    token,
  });
}));

// GET /api/auth/me
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const userGroups = await db.select({ id: groups.id, name: groups.name })
    .from(groupMembers)
    .leftJoin(groups, eq(groupMembers.group_id, groups.id))
    .where(eq(groupMembers.user_id, userId));
  res.json({ user: { ...req.user, groups: userGroups } });
}));

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ status: 'logged_out' });
});

// ── GET /api/auth/profile — full user profile with role ────────────────────

router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  let roleInfo = null;
  if (user.role_id) {
    const [role] = await db.select().from(roles).where(eq(roles.id, user.role_id));
    if (role) roleInfo = { id: role.id, name: role.name, permissions: role.permissions };
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    role: roleInfo,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  });
}));

// ── PUT /api/auth/profile — update profile fields ─────────────────────────

router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { name, email } = req.body || {};

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  // If changing email, check it's not taken
  if (updates.email) {
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing && existing.id !== userId) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  let roleInfo = null;
  if (user.role_id) {
    const [role] = await db.select().from(roles).where(eq(roles.id, user.role_id));
    if (role) roleInfo = { id: role.id, name: role.name, permissions: role.permissions };
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    role: roleInfo,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  });
}));

// ── PUT /api/auth/password — change password (local accounts only) ─────────

router.put('/password', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  if (user.provider !== 'local') {
    res.status(403).json({ error: 'Password change is only available for local accounts' });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash || '');
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const password_hash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ password_hash }).where(eq(users.id, userId));

  res.json({ status: 'ok' });
}));

export default router;
