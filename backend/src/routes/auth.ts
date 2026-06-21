import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as oidc from 'openid-client';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, roles } from '../db/schema.js';
import { authenticate, JWT_SECRET } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// ── SSO / OIDC Configuration ──────────────────────────────────────────────

const SSO_PROVIDER = process.env.AUTH_SSO_PROVIDER || '';
const SSO_CLIENT_ID = process.env.AUTH_SSO_CLIENT_ID || '';
const SSO_CLIENT_SECRET = process.env.AUTH_SSO_CLIENT_SECRET || '';
const SSO_ISSUER = process.env.AUTH_SSO_ISSUER || '';
const SSO_REDIRECT_URI = process.env.AUTH_SSO_REDIRECT_URI || 'http://localhost:3001/api/auth/sso/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Group-to-role mapping for SSO (comma-separated list of group names)
const ADMIN_GROUPS = (process.env.AUTH_ADMIN_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean);
const EDITOR_GROUPS = (process.env.AUTH_EDITOR_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean);

// Determine role from SSO group claims
function resolveRoleFromGroups(claims: Record<string, unknown>): string {
  // Groups can be in different claims depending on provider
  const groups: string[] = [];
  if (Array.isArray(claims.groups)) groups.push(...claims.groups.map(String));
  if (claims.realm_access && typeof claims.realm_access === 'object') {
    const ra = claims.realm_access as Record<string, unknown>;
    if (Array.isArray(ra.roles)) groups.push(...ra.roles.map(String));
  }
  if (groups.some(g => ADMIN_GROUPS.includes(g))) return 'admin';
  if (groups.some(g => EDITOR_GROUPS.includes(g))) return 'editor';
  return 'approver';
}

// Lazy-init OIDC client (only when SSO is configured)
let _oidcClient: any = null;
async function getOidcClient() {
  if (_oidcClient) return _oidcClient;
  const oidcConfig = await oidc.discovery(new URL(SSO_ISSUER), SSO_CLIENT_ID, undefined, oidc.ClientSecretBasic(SSO_CLIENT_SECRET));
  _oidcClient = oidcConfig;
  return _oidcClient;
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

router.get('/config', (_req, res) => {
  const ssoConfigured = !!(SSO_PROVIDER && SSO_CLIENT_ID && SSO_CLIENT_SECRET && SSO_ISSUER);
  res.json({
    providers: ssoConfigured ? ['local', SSO_PROVIDER] : ['local'],
    sso: ssoConfigured ? { provider: SSO_PROVIDER, name: SSO_PROVIDER === 'keycloak' ? 'Keycloak' : 'SSO' } : null,
  });
});

// ── GET /api/auth/sso/login — redirect to OIDC provider ───────────────────

router.get('/sso/login', asyncHandler(async (_req, res) => {
  if (!SSO_PROVIDER) {
    res.status(400).json({ error: 'SSO not configured' });
    return;
  }
  try {
    const config = await getOidcClient();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const authUrl = oidc.buildAuthorizationUrl(config, {
      scope: 'openid email profile',
      state,
      nonce,
      redirect_uri: SSO_REDIRECT_URI,
    });
    // Store state+nonce in a cookie for verification on callback
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
    const config = await getOidcClient();
    // Build the full callback URL from the incoming request
    const currentUrl = new URL(req.originalUrl || req.url, SSO_REDIRECT_URI);
    const tokenSet = await oidc.authorizationCodeGrant(
      config,
      currentUrl,
      { expectedState: state, expectedNonce: nonce } as any,
      { id_token_signed_response_alg: 'RS256' },
    );

    // Decode the ID token to get user claims
    const rawTokenSet = tokenSet as any;
    const claims = rawTokenSet.id_token ? decodeJwtPayload(rawTokenSet.id_token) : {};
    const email = String(claims.email || claims.preferred_username || '');
    const name = String(claims.name || claims.given_name || email.split('@')[0] || 'SSO User');
    const sub = String(claims.sub || '');

    if (!email && !sub) {
      res.redirect(`${FRONTEND_URL}/login?error=no_user_info`);
      return;
    }

    // Find or create user by provider + provider_id
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.provider_id, sub));

    if (!user && email) {
      // Try matching by email
      [user] = await db.select().from(users).where(eq(users.email, email));
    }

    if (!user) {
      // Create new user from SSO claims
      const [viewerRole] = await db.select().from(roles).where(eq(roles.name, 'approver'));
      [user] = await db.insert(users).values({
        email,
        name,
        password_hash: '',
        provider: SSO_PROVIDER,
        provider_id: sub,
        role_id: viewerRole?.id || null,
      }).returning();
    } else if (!user.provider_id) {
      // Link existing local user to SSO
      await db.update(users)
        .set({ provider: SSO_PROVIDER, provider_id: sub })
        .where(eq(users.id, user.id));
    }

    // Map SSO groups to role
    const ssoRoleName = resolveRoleFromGroups(claims);
    const [mappedRole] = await db.select().from(roles).where(eq(roles.name, ssoRoleName));
    if (mappedRole && user.role_id !== mappedRole.id) {
      await db.update(users).set({ role_id: mappedRole.id }).where(eq(users.id, user.id));
      user.role_id = mappedRole.id;
    }

    // Issue our JWT
    let roleName = 'approver';
    let permissions: string[] = [];
    if (user.role_id) {
      const [role] = await db.select().from(roles).where(eq(roles.id, user.role_id));
      if (role) {
        roleName = role.name;
        permissions = role.permissions || [];
      }
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: roleName, permissions },
      JWT_SECRET,
      { expiresIn: '7d' },
    );

    // Set cookie + update last login
    res.cookie('token', token, {
      httpOnly: true, sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    await db.update(users).set({ last_login_at: new Date() }).where(eq(users.id, user.id));

    // Clean up SSO cookies
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

  // Get role: admin for first user, viewer otherwise
  const [role] = await db.select().from(roles).where(eq(roles.name, isFirstUser ? 'admin' : 'approver'));

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
    { userId: user.id, email: user.email, role: role?.name || 'approver', permissions: rolePermissions },
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
    user: { id: user.id, email: user.email, name: user.name, role: role?.name || 'approver', permissions: rolePermissions },
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
  let roleName = 'approver';
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
  res.json({ user: req.user });
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

export default router;
