// ── Mock OpenAI-compatible LLM API for E2E testing ───────────────
// Run: npx tsx test/mock-llm/server.ts
// Listens on port 3002 by default (override with PORT env)
//
// Supports:
//   - POST /v1/chat/completions (streaming + non-streaming)
//   - GET  /health

import http from 'node:http';
import url from 'node:url';

const PORT = parseInt(process.env.PORT || '3002', 10);

function jsonResponse(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function extractResponse(messages: any[]): string {
  // If system prompt contains MOCK_RESPONSE: <json>, use that
  for (const msg of messages) {
    if (msg.role === 'system' && typeof msg.content === 'string') {
      const match = msg.content.match(/MOCK_RESPONSE:\s*(.+)/s);
      if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  // Otherwise echo last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return `Mock response to: ${String(messages[i].content).slice(0, 200)}`;
    }
  }
  return 'Mock response (no user message found)';
}

function generateDummyJson(schema: any): Record<string, unknown> {
  const dummy: Record<string, unknown> = {};
  if (schema?.properties) {
    for (const [key, val] of Object.entries<any>(schema.properties)) {
      if (val.type === 'string') dummy[key] = `mock_${key}`;
      else if (val.type === 'number') dummy[key] = 42;
      else if (val.type === 'boolean') dummy[key] = true;
      else if (val.type === 'array') dummy[key] = [];
      else dummy[key] = null;
    }
  }
  return dummy;
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url || '', true);
  const path = parsed.pathname || '';

  // GET /health
  if (req.method === 'GET' && path === '/health') {
    jsonResponse(res, 200, { status: 'ok', service: 'mock-llm' });
    return;
  }

  // POST /v1/chat/completions
  if (req.method === 'POST' && path === '/v1/chat/completions') {
    let body = '';
    for await (const chunk of req) body += chunk;

    let params: any = {};
    try { params = JSON.parse(body); } catch {
      jsonResponse(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const { model, messages, stream, response_format } = params;
    const mockContent = extractResponse(messages || []);

    const responseId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const created = Math.floor(Date.now() / 1000);

    if (stream) {
      // SSE streaming
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const content = String(mockContent);
      const tokens = content.split(/(\s+)/);

      res.write(`data: ${JSON.stringify({ id: responseId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);

      for (const token of tokens) {
        res.write(`data: ${JSON.stringify({ id: responseId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: token }, finish_reason: null }] })}\n\n`);
        await new Promise(r => setTimeout(r, 5));
      }

      res.write(`data: ${JSON.stringify({ id: responseId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Non-streaming
    const response: any = {
      id: responseId,
      object: 'chat.completion',
      created,
      model: model || 'mock-model',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: mockContent },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    // If json_object response requested, try to parse mockContent as JSON
    if (response_format?.type === 'json_object') {
      try {
        const parsed = JSON.parse(mockContent);
        response.choices[0].message.content = JSON.stringify(parsed);
      } catch {
        // Return plain text content as-is
      }
    }

    jsonResponse(res, 200, response);
    return;
  }

  jsonResponse(res, 404, { error: 'Not found', path });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock LLM API listening on http://0.0.0.0:${PORT}`);
});
