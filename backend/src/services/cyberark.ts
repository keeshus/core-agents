export interface CyberArkConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  caCert?: string;
}

let tokenCache = new Map<string, { token: string; expiresAt: number }>();

import https from 'node:https';

function fetchOptions(config: CyberArkConfig): RequestInit & { agent?: https.Agent } {
  const opts: RequestInit & { agent?: https.Agent } = {};
  if (config.caCert) {
    opts.agent = new https.Agent({ ca: config.caCert });
  }
  return opts;
}

export async function authenticate(config: CyberArkConfig): Promise<string> {
  const cacheKey = `${config.baseUrl}:${config.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

  const url = `${config.baseUrl.replace(/\/$/, '')}/oauth2/token`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: controller.signal,
      ...fetchOptions(config),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`CyberArk auth failed: ${res.status} ${err}`);
    }

    const data = await res.json() as { access_token: string; expires_in?: number };
    const expiresIn = (data.expires_in ?? 3600) * 1000;
    tokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + expiresIn });
    return data.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSecret(config: CyberArkConfig, path: string, retries = 1): Promise<string> {
  const token = await authenticate(config);
  const url = `${config.baseUrl.replace(/\/$/, '')}/secrets/${encodeURIComponent(path)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      ...fetchOptions(config),
    });

    if (res.status === 401 && retries > 0) {
      tokenCache.delete(`${config.baseUrl}:${config.clientId}`);
      return getSecret(config, path, retries - 1);
    }

    if (!res.ok) {
      if (res.status === 404) throw new Error(`Secret '${path}' not found in CyberArk`);
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`CyberArk getSecret failed: ${res.status} ${err}`);
    }

    const data = await res.json() as { value?: string; content?: string };
    return (data.value ?? data.content) as string;
  } finally {
    clearTimeout(timeout);
  }
}

export async function testConnection(config: CyberArkConfig): Promise<{ success: boolean; error?: string }> {
  try {
    await authenticate(config);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export function clearTokenCache() {
  tokenCache.clear();
}
