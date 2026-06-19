/**
 * Built-in tool definitions and direct execution.
 * Tools: store, file, now, uuid, log, fetch
 * These are auto-injected into every LLM Agent node and executed directly
 * (no MCP transport needed).
 */
import { resolve, dirname } from 'node:path';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// ── Interfaces ──────────────────────────────────────────────────────────────────

export interface BuiltInToolInfo {
  name: string;
  description: string;
}

// ── Tool list (used by engine.ts for auto-injection into LLM agents) ──────────

export const BUILT_IN_TOOLS: BuiltInToolInfo[] = [
  { name: 'store_get', description: 'Read a persisted value by key from the agent store' },
  { name: 'store_set', description: 'Persist a value by key (upserts) in the agent store' },
  { name: 'store_delete', description: 'Remove a persisted value by key from the agent store' },
  { name: 'store_list', description: 'List all stored keys in the agent store' },
  { name: 'file_read', description: 'Read a file from the shared workspace' },
  { name: 'file_write', description: 'Write content to a file in the shared workspace' },
  { name: 'file_list', description: 'List directory contents in the shared workspace' },
  { name: 'now', description: 'Get the current date and time. Optionally specify a timezone (e.g. "Europe/Amsterdam", "America/New_York") or locale (e.g. "nl-NL", "ja-JP").' },
  { name: 'uuid', description: 'Generate a version 4 UUID' },
  { name: 'log', description: 'Write a log entry (info/warn/error)' },
  { name: 'fetch', description: 'Perform an HTTP GET request' },
];

// ── Tool input schemas (used by engine.ts for auto-injection) ─────────────────

const TOOL_SCHEMAS: Record<string, { type: string; properties: Record<string, unknown>; required?: string[] }> = {
  'store.get': {
    type: 'object',
    properties: { key: { type: 'string', description: 'The key to look up' } },
    required: ['key'],
  },
  'store.set': {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'The key to store under' },
      value: { type: 'string', description: 'Any JSON-serializable value to persist' },
    },
    required: ['key', 'value'],
  },
  'store.delete': {
    type: 'object',
    properties: { key: { type: 'string', description: 'The key to remove' } },
    required: ['key'],
  },
  'store.list': {
    type: 'object',
    properties: {},
  },
  'file.read': {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within the shared workspace' },
    },
    required: ['path'],
  },
  'file.write': {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within the shared workspace' },
      content: { type: 'string', description: 'Text content to write' },
    },
    required: ['path', 'content'],
  },
  'file.list': {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative directory path (defaults to root)' },
    },
  },
  'now': {
    type: 'object',
    properties: {
      timezone: { type: 'string', description: 'IANA timezone, e.g. "Europe/Amsterdam", "America/New_York". Defaults to UTC.' },
      locale: { type: 'string', description: 'Locale for formatting, e.g. "nl-NL", "ja-JP", "en-US". Defaults to "en-US".' },
    },
  },
  'uuid': { type: 'object', properties: {} },
  'log': {
    type: 'object',
    properties: {
      level: { type: 'string', enum: ['info', 'warn', 'error'], description: 'Log severity level' },
      message: { type: 'string', description: 'The log message' },
    },
    required: ['message'],
  },
  'fetch': {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
    },
    required: ['url'],
  },
};

// ── Direct tool execution (in-process, no MCP transport needed) ────────────────
// Handles utility tools (now, uuid, log, fetch) that don't need DB access.
// Store/file tools require database access — configure an MCP tool node for those.

export async function callBuiltInTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'now': {
      const d = new Date();
      const timezone = (args?.timezone as string) || 'UTC';
      const locale = (args?.locale as string) || 'en-US';
      const formatted = new Intl.DateTimeFormat(locale, {
        dateStyle: 'full', timeStyle: 'long', timeZone: timezone,
      }).format(d);
      return JSON.stringify({
        iso: d.toISOString(),
        unix: d.getTime(),
        formatted,
        timezone,
      });
    }
    case 'uuid': {
      return JSON.stringify({ uuid: randomUUID() });
    }
    case 'log': {
      const level = (args?.level as string) || 'info';
      const message = (args?.message as string) || '';
      console.log(`[builtin-log:${level}] ${message}`);
      return JSON.stringify({ logged: true, level, message });
    }
    case 'fetch': {
      const url = args?.url as string;
      if (!url?.startsWith('http://') && !url?.startsWith('https://')) {
        throw new Error('Only HTTP(S) URLs are allowed');
      }
      const response = await fetch(url);
      const text = await response.text();
      return JSON.stringify({ status: response.status, body: text });
    }
    default:
      throw new Error(`Built-in tool "${name}" requires a database connection — add an MCP tool node in the flow`);
  }
}

// ── Path safety helper (used by file tools) ────────────────────────────────────

export function resolveSafePath(basePath: string, userPath: string): string {
  const requested = resolve(basePath, userPath);
  if (!requested.startsWith(basePath)) {
    throw new Error('Path traversal detected');
  }
  return requested;
}

// ── JSON parse helper ──────────────────────────────────────────────────────────

function maybeParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}
