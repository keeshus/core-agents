import { describe, it, expect } from 'vitest';

// ── Replicate the tool permission filter logic from AssistantContext ─────────

const toolPerms: Record<string, string> = {
  create_endpoint: 'endpoint:write', delete_endpoint: 'endpoint:write',
  create_mcp_server: 'mcp:write', delete_mcp_server: 'mcp:write', refresh_mcp_tools: 'mcp:write',
  create_embedding_provider: 'embedding:write', delete_embedding_provider: 'embedding:write',
  create_vector_store: 'store:write', delete_vector_store: 'store:write',
  list_users: 'admin', create_user: 'admin', delete_user: 'admin', update_user_role: 'admin',
  list_executions: 'admin',
  list_endpoints: 'endpoint:read', list_mcp_servers: 'mcp:read',
  list_embedding_providers: 'embedding:read', list_vector_stores: 'store:read',
  get_pending_approvals: 'execution:approve', approve_execution: 'execution:approve', reject_execution: 'execution:approve',
};

const adminPerms = ['admin','flow:create','flow:edit','flow:delete','endpoint:read','endpoint:write','mcp:read','mcp:write','embedding:read','embedding:write','store:read','store:write','document:write','knowledge:write','chat:create','execution:approve'];
const editorPerms = ['flow:create','flow:edit','execution:approve','endpoint:read','mcp:read','embedding:read','store:read','document:write','knowledge:write','chat:create'];
const approverPerms = ['execution:approve'];

function filterTools(toolNames: string[], userPerms: string[]): string[] {
  return toolNames.filter(name => !toolPerms[name] || userPerms.includes(toolPerms[name]));
}

// ── Replicate getToolGroupNames from registry.ts ────────────────────────────

function getToolGroupNames(pageKey: string): string[] {
  const groups: string[] = ['navigation'];
  if (pageKey?.startsWith('flow:')) groups.push('flow-editor');
  else if (pageKey === 'settings:endpoints') groups.push('endpoint-crud');
  else if (pageKey === 'settings:mcp-servers') groups.push('mcp-crud');
  else if (pageKey === 'settings:knowledge') groups.push('embedding-crud', 'store-crud');
  else if (pageKey === 'settings:users') groups.push('user-crud');
  else if (pageKey === 'approvals') groups.push('approvals');
  else if (pageKey?.startsWith('executions:')) groups.push('executions');
  return groups;
}

// ── Replicate page capability descriptions ──────────────────────────────────

function getPageCapabilities(pageKey: string): string {
  if (pageKey.startsWith('flow:')) return 'flow editor canvas';
  if (pageKey === 'flows-list') return 'flow list';
  if (pageKey === 'approvals') return 'pending approvals';
  if (pageKey === 'settings:endpoints') return 'LLM endpoints config';
  if (pageKey === 'settings:mcp-servers') return 'MCP servers config';
  if (pageKey === 'settings:knowledge') return 'knowledge bases config';
  if (pageKey === 'settings:users') return 'user management';
  if (pageKey === 'profile') return 'profile editing';
  return '';
}

// ── Tool definitions for testing (subset from registry) ─────────────────────

const toolGroups: Record<string, string[]> = {
  'navigation': ['navigate_to'],
  'flow-editor': ['get_flow_json', 'add_node', 'get_node_config', 'update_node_field', 'get_available_nodes', 'read_code', 'replace_code'],
  'endpoint-crud': ['list_endpoints', 'create_endpoint', 'delete_endpoint'],
  'mcp-crud': ['list_mcp_servers', 'create_mcp_server', 'delete_mcp_server', 'refresh_mcp_tools'],
  'embedding-crud': ['list_embedding_providers', 'create_embedding_provider', 'delete_embedding_provider'],
  'store-crud': ['list_vector_stores', 'create_vector_store', 'delete_vector_store'],
  'user-crud': ['list_users', 'create_user', 'delete_user', 'update_user_role'],
  'approvals': ['get_pending_approvals', 'approve_execution', 'reject_execution'],
  'executions': ['list_executions', 'get_execution_details'],
};

function getToolsForPage(pageKey: string): string[] {
  return getToolGroupNames(pageKey).flatMap(g => toolGroups[g] || []);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('tool permission filter', () => {
  it('includes tools the user has permission for', () => {
    const tools = ['list_endpoints', 'create_endpoint', 'list_mcp_servers'];
    expect(filterTools(tools, adminPerms)).toEqual(tools);
    expect(filterTools(tools, editorPerms)).toEqual(['list_endpoints', 'list_mcp_servers']);
    expect(filterTools(tools, approverPerms)).toEqual([]);
  });

  it('filters out admin-only tools for editors', () => {
    const tools = ['list_users', 'create_user', 'delete_user', 'update_user_role'];
    expect(filterTools(tools, adminPerms)).toEqual(tools);
    expect(filterTools(tools, editorPerms)).toEqual([]);
  });

  it('allows execution:approve tools for all roles', () => {
    const tools = ['get_pending_approvals', 'approve_execution', 'reject_execution'];
    expect(filterTools(tools, adminPerms)).toEqual(tools);
    expect(filterTools(tools, editorPerms)).toEqual(tools);
    expect(filterTools(tools, approverPerms)).toEqual(tools);
  });

  it('filters write tools for editors', () => {
    const writeTools = ['create_endpoint', 'delete_endpoint', 'create_mcp_server', 'delete_mcp_server', 'create_embedding_provider', 'delete_embedding_provider'];
    expect(filterTools(writeTools, editorPerms)).toEqual([]);
    expect(filterTools(writeTools, adminPerms)).toEqual(writeTools);
  });

  it('leaves tools without permission requirement unchanged', () => {
    const tools = ['read_code', 'replace_code', 'navigate_to', 'get_flow_json'];
    expect(filterTools(tools, approverPerms)).toEqual(tools);
    expect(filterTools(tools, editorPerms)).toEqual(tools);
    expect(filterTools(tools, adminPerms)).toEqual(tools);
  });
});

describe('getToolGroupNames', () => {
  it('returns navigation for all pages', () => {
    ['flows-list', 'approvals', 'profile', 'settings:endpoints'].forEach(key => {
      expect(getToolGroupNames(key)).toContain('navigation');
    });
  });

  it('returns flow-editor for flow pages', () => {
    expect(getToolGroupNames('flow:abc')).toContain('flow-editor');
  });

  it('returns approvals for approvals page', () => {
    expect(getToolGroupNames('approvals')).toContain('approvals');
  });

  it('returns endpoint-crud for endpoint settings', () => {
    expect(getToolGroupNames('settings:endpoints')).toContain('endpoint-crud');
  });

  it('returns mcp-crud for MCP settings', () => {
    expect(getToolGroupNames('settings:mcp-servers')).toContain('mcp-crud');
  });

  it('returns embedding+store for knowledge settings', () => {
    const groups = getToolGroupNames('settings:knowledge');
    expect(groups).toContain('embedding-crud');
    expect(groups).toContain('store-crud');
  });

  it('returns user-crud for user settings', () => {
    expect(getToolGroupNames('settings:users')).toContain('user-crud');
  });

  it('returns executions for execution pages', () => {
    expect(getToolGroupNames('executions:abc')).toContain('executions');
  });
});

describe('end-to-end: page tools filtered by role', () => {
  it('viewer on approvals page gets only approval tools', () => {
    const tools = getToolsForPage('approvals');
    const filtered = filterTools(tools, approverPerms);
    expect(filtered).toContain('get_pending_approvals');
    expect(filtered).toContain('approve_execution');
    expect(filtered).toContain('reject_execution');
    expect(filtered).toContain('navigate_to');
    expect(filtered).not.toContain('list_endpoints');
  });

  it('admin on endpoints page gets all endpoint tools', () => {
    const tools = getToolsForPage('settings:endpoints');
    const filtered = filterTools(tools, adminPerms);
    expect(filtered).toContain('list_endpoints');
    expect(filtered).toContain('create_endpoint');
    expect(filtered).toContain('delete_endpoint');
  });

  it('editor on endpoints page gets read-only endpoint tools', () => {
    const tools = getToolsForPage('settings:endpoints');
    const filtered = filterTools(tools, editorPerms);
    expect(filtered).toContain('list_endpoints');
    expect(filtered).not.toContain('create_endpoint');
    expect(filtered).not.toContain('delete_endpoint');
  });

  it('admin on flow editor gets flow tools', () => {
    const tools = getToolsForPage('flow:abc');
    const filtered = filterTools(tools, adminPerms);
    expect(filtered).toContain('get_flow_json');
    expect(filtered).toContain('add_node');
    expect(filtered).toContain('read_code');
  });

  it('viewer on flow editor gets navigation + unrestricted tools', () => {
    const tools = getToolsForPage('flow:abc');
    const filtered = filterTools(tools, approverPerms);
    // Flow editor tools without explicit permission requirements pass through
    expect(filtered).toContain('navigate_to');
    expect(filtered).toContain('read_code');
    expect(filtered).toContain('get_flow_json');
    expect(filtered).not.toContain('list_endpoints');
  });

  it('admin on users page gets all user tools', () => {
    const tools = getToolsForPage('settings:users');
    const filtered = filterTools(tools, adminPerms);
    expect(filtered).toContain('list_users');
    expect(filtered).toContain('create_user');
    expect(filtered).toContain('delete_user');
    expect(filtered).toContain('update_user_role');
  });

  it('editor on users page gets only navigation', () => {
    const tools = getToolsForPage('settings:users');
    const filtered = filterTools(tools, editorPerms);
    expect(filtered).toEqual(['navigate_to']);
  });
});

describe('page capability descriptions', () => {
  it('returns description for all known page keys', () => {
    const keys = ['flow:abc', 'flows-list', 'approvals', 'settings:endpoints', 'settings:mcp-servers', 'settings:knowledge', 'settings:users', 'profile'];
    keys.forEach(key => expect(getPageCapabilities(key)).toBeTruthy());
  });

  it('returns empty for unknown page keys', () => {
    expect(getPageCapabilities('unknown:page')).toBe('');
  });
});
