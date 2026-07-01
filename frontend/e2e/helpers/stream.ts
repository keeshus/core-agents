import type { APIRequestContext } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

/**
 * Execute a flow in debug mode and read all SSE events.
 * Uses native fetch. Pass cookies from the auth state explicitly.
 */
export async function debugExecute(
  flowId: string,
  input: Record<string, unknown>,
  cookieHeader?: string,
): Promise<SSEEvent[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  const res = await fetch(`${API_URL}/flows/${flowId}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input, _debug: true }),
  });
  if (!res.ok) throw new Error(`Execute failed: ${res.status}`);
  return readSSE(res);
}

/**
 * Read SSE events from a streaming response.
 */
export async function readSSE(response: Response): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  const reader = response.body?.getReader();
  if (!reader) return events;

  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const evt = JSON.parse(line.slice(6));
            events.push(evt);
          } catch { /* ignore malformed */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return events;
}

/**
 * Poll a persisted execution by ID until it finishes or times out.
 */
export async function pollExecution(
  request: APIRequestContext,
  executionId: string,
  timeoutMs = 30000,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`${API_URL}/executions/${executionId}`);
    if (!res.ok()) throw new Error(`Poll failed: ${res.status()}`);
    const exec = await res.json();
    if (exec.status === 'completed' || exec.status === 'failed' || exec.status === 'cancelled') {
      return exec;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
}

interface SSEEvent {
  type: string;
  data?: any;
}
