/**
 * Mock OIDC Provider — OIDC-compliant authorization code flow.
 *
 * Implements the OIDC Core 1.0 spec:
 *   - Discovery (/.well-known/openid-configuration)
 *   - Authorization endpoint (/dex/auth) with login form
 *   - Token endpoint (/dex/token) with client_secret_basic auth
 *   - UserInfo endpoint (/dex/userinfo)
 *   - JWKS endpoint (/dex/keys) — RS256 signed JWTs
 *
 * Users are static. Groups are returned in both the id_token and userinfo
 * so the app's SSO callback can perform role mapping.
 */

import http from 'http';
import crypto from 'crypto';

const PORT = 3004;
const ISSUER = `http://mock-oidc-e2e:${PORT}/dex`;
const CLIENT_ID = 'core-agents';
const CLIENT_SECRET = 'e2e-test-secret';

// ── RSA key pair for JWT signing ──────────────────────────────────────

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const KID = 'mock-oidc-rsa-1';

function getJwk() {
  const pub = crypto.createPublicKey(publicKey);
  const jwk = pub.export({ format: 'jwk' });
  return { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', kid: KID, use: 'sig' };
}

// ── User database ─────────────────────────────────────────────────────

interface MockUser {
  email: string;
  password: string;
  name: string;
  groups: string[];
}

const USERS: Record<string, MockUser> = {
  'admin@mock.local':   { email: 'admin@mock.local',   password: 'password', name: 'Admin',   groups: ['core-agents-admin'] },
  'editor@mock.local':  { email: 'editor@mock.local',  password: 'password', name: 'Editor',  groups: ['core-agents-editor'] },
  'reader@mock.local':  { email: 'reader@mock.local',  password: 'password', name: 'Reader',  groups: ['some-other-group'] },
  'nogroup@mock.local': { email: 'nogroup@mock.local', password: 'password', name: 'NoGroup', groups: [] },
};

// ── Transient stores ──────────────────────────────────────────────────

const authCodes = new Map<string, { email: string; state: string; nonce: string }>();
const accessTokens = new Map<string, { email: string }>();
const refreshTokens = new Map<string, { email: string }>();

// Short-lived tokens — group changes are detected within minutes
const TOKEN_EXPIRY = 300; // 5 minutes

// ── Helpers ───────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function randToken(): string {
  return b64url(crypto.randomBytes(32));
}

function subFor(email: string): string {
  return crypto.createHash('sha256').update(email).digest('hex');
}

function signJWT(claims: Record<string, unknown>): string {
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: ISSUER,
    aud: CLIENT_ID,
    exp: now + 3600,
    iat: now,
    ...claims,
  };
  const e = (o: unknown) => b64url(Buffer.from(JSON.stringify(o)));
  const message = `${e(header)}.${e(body)}`;
  const sig = crypto.sign('sha256', Buffer.from(message), privateKey);
  return `${message}.${b64url(sig)}`;
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const qs: Record<string, string> = {};
  for (const part of url.slice(idx + 1).split('&')) {
    const [k, v] = part.split('=');
    qs[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return qs;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

function loginPage(action: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Mock OIDC</title></head>
<body style="font-family:sans-serif;padding:2rem">
  <h2>Mock OIDC Login</h2>
  <form method="post" action="${action}">
    <p><label>Email<br><input id="login" name="login" type="text" placeholder="email" required /></label></p>
    <p><label>Password<br><input id="password" name="password" type="password" placeholder="password" required /></label></p>
    <p><button id="submit-login" type="submit">Login</button></p>
  </form>
</body></html>`;
}

// ── Server ────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';
  const path = url.includes('?') ? url.slice(0, url.indexOf('?')) : url;
  console.log(`${method} ${url}`);

  const json = (status: number, data: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    });
    res.end(JSON.stringify(data));
  };

  const html = (status: number, body: string) => {
    res.writeHead(status, { 'Content-Type': 'text/html' });
    res.end(body);
  };

  if (method === 'OPTIONS') { json(204, ''); return; }

  // https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata
  if (method === 'GET' && path === '/dex/.well-known/openid-configuration') {
    json(200, {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/auth`,
      token_endpoint: `${ISSUER}/token`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
      jwks_uri: `${ISSUER}/keys`,
      scopes_supported: ['openid', 'email', 'profile', 'groups'],
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      claims_supported: ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce', 'email', 'name', 'groups'],
    });
    return;
  }

  // JWKS — rfc7517
  if (method === 'GET' && path === '/dex/keys') {
    json(200, { keys: [getJwk()] });
    return;
  }

  // Authorization endpoint — OIDC Core 1.0 §3.1.1
  if (path === '/dex/auth') {
    const qs = parseQuery(url);
    const { response_type, redirect_uri, scope, state, nonce } = qs;

    if (response_type !== 'code') {
      html(400, '<h2>Invalid response_type</h2>');
      return;
    }
    if (!redirect_uri) {
      html(400, '<h2>Missing redirect_uri</h2>');
      return;
    }
    if (!state) {
      html(400, '<h2>Missing state</h2>');
      return;
    }

    if (method === 'GET') {
      const action = `/dex/auth?${Object.entries(qs).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
      html(200, loginPage(action));
      return;
    }

    if (method === 'POST') {
      const body = await readBody(req);
      const form = Object.fromEntries(new URLSearchParams(body));
      const user = Object.values(USERS).find(u => u.email === form.login && u.password === form.password);

      if (!user) {
        html(400, '<h2>Invalid credentials</h2>');
        return;
      }

      // Generate authorization code (OIDC Core 1.0 §3.1.2)
      const code = randToken();
      authCodes.set(code, { email: user.email, state, nonce: nonce || '' });

      // Redirect with code + state
      const location = `${redirect_uri}?code=${code}&state=${state}`;
      res.writeHead(302, { Location: location });
      res.end();
      return;
    }
  }

  // Token endpoint — OIDC Core 1.0 §3.1.3
  if (path === '/dex/token') {
    const body = await readBody(req);
    // Supports both client_secret_basic (Authorization header) and client_secret_post (body)
    // Per OAuth2 spec, client_id/secret in Basic auth are URL-encoded
    const authHeader = req.headers['authorization'] || '';
    let clientId = '';
    let clientSecret = '';
    if (authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const [rawId, rawSecret] = decoded.split(':');
      clientId = decodeURIComponent(rawId || '');
      clientSecret = decodeURIComponent(rawSecret || '');
    }

    const form = Object.fromEntries(new URLSearchParams(body));
    const grantType = form.grant_type || '';
    const code = form.code || '';
    const redirectUri = form.redirect_uri || '';
    clientId = clientId || form.client_id || '';
    clientSecret = clientSecret || form.client_secret || '';

    if (grantType === 'refresh_token') {
      const refresh = form.refresh_token || '';
      const stored = refreshTokens.get(refresh);
      if (!stored) {
        json(400, { error: 'invalid_grant' });
        return;
      }

      // Rotate the refresh token
      refreshTokens.delete(refresh);
      const newRefresh = randToken();
      refreshTokens.set(newRefresh, { email: stored.email });

      // Issue a new, short-lived access+id token
      const newAccess = randToken();
      accessTokens.set(newAccess, { email: stored.email });

      const user = Object.values(USERS).find(u => u.email === stored.email);
      const sub = user ? subFor(user.email) : '';
      const idToken = user ? signJWT({
        sub,
        email: user.email,
        name: user.name,
        groups: user.groups,
      }) : '';

      json(200, {
        access_token: newAccess,
        token_type: 'Bearer',
        expires_in: TOKEN_EXPIRY,
        refresh_token: newRefresh,
        id_token: idToken,
      });
      return;
    }

    if (grantType !== 'authorization_code') {
      json(400, { error: 'unsupported_grant_type' });
      return;
    }
    if (clientId !== CLIENT_ID || clientSecret !== CLIENT_SECRET) {
      json(401, { error: 'invalid_client' });
      return;
    }

    const stored = authCodes.get(code);
    if (!stored) {
      json(400, { error: 'invalid_grant' });
      return;
    }

    authCodes.delete(code);
    const user = Object.values(USERS).find(u => u.email === stored.email);
    if (!user) {
      json(400, { error: 'invalid_user' });
      return;
    }

    // Generate short-lived tokens — OIDC group changes propagate quickly
    const accessToken = randToken();
    accessTokens.set(accessToken, { email: user.email });

    const refreshToken = randToken();
    refreshTokens.set(refreshToken, { email: user.email });

    const sub = subFor(user.email);
    const idToken = signJWT({
      sub,
      nonce: stored.nonce,
      email: user.email,
      name: user.name,
      groups: user.groups,
    });

    json(200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: TOKEN_EXPIRY,
      refresh_token: refreshToken,
      id_token: idToken,
    });
    return;
  }

  // UserInfo endpoint — OIDC Core 1.0 §5.3
  if (path === '/dex/userinfo') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const stored = accessTokens.get(token);

    if (!stored) {
      json(401, { error: 'unauthorized' });
      return;
    }

    const user = Object.values(USERS).find(u => u.email === stored.email);
    if (!user) {
      json(401, { error: 'user_not_found' });
      return;
    }

    json(200, {
      sub: subFor(user.email),
      email: user.email,
      name: user.name,
      groups: user.groups,
    });
    return;
  }

  json(404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`Mock OIDC server listening on port ${PORT}`);
});
