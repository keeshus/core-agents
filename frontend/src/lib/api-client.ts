const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/**
 * Stream SSE events from a POST endpoint.
 * Returns an async generator that yields parsed JSON events.
 */
export async function* streamSSE(url: string, body: unknown, signal?: AbortSignal): AsyncGenerator<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6));
        } catch {
          // Skip malformed SSE frames
        }
      }
    }
  }
}

export const api = {
  flows: {
    list: () => request<any[]>('/flows'),
    get: (id: string) => request<any>(`/flows/${id}`),
    create: (data: { name: string; description?: string }) =>
      request<any>('/flows', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/flows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/flows/${id}`, { method: 'DELETE' }),
    execute: async (id: string, input?: Record<string, unknown>) => {
      const res = await fetch(`${BASE_URL}/flows/${id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `Request failed: ${res.status}`);
      }
      // Consume first SSE event to confirm execution started, then close
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.includes('\n\n')) break;
        }
        reader.cancel();
      }
    },
    executeStream: (id: string, input?: Record<string, unknown>, signal?: AbortSignal) =>
      streamSSE(`${BASE_URL}/flows/${id}/execute`, { input }, signal),
  },
  catalog: {
    list: () => request<any[]>('/catalog'),
  },
  llmEndpoints: {
    list: () => request<any[]>('/llm-endpoints'),
    get: (id: string) => request<any>(`/llm-endpoints/${id}`),
    create: (data: any) => request<any>('/llm-endpoints', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/llm-endpoints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/llm-endpoints/${id}`, { method: 'DELETE' }),
  },
  mcpServers: {
    list: () => request<any[]>('/mcp-servers'),
    get: (id: string) => request<any>(`/mcp-servers/${id}`),
    create: (data: any) => request<any>('/mcp-servers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/mcp-servers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/mcp-servers/${id}`, { method: 'DELETE' }),
    refreshTools: (id: string) => request<any>(`/mcp-servers/${id}/refresh`, { method: 'POST' }),
  },
};
