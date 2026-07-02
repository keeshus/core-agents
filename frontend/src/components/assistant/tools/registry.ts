import type { AssistantTool } from '../AssistantContext';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

const norm = (s: string) => s.replace(/\u001b\[\d*m/g, '').trim();

// ── Helper: authenticated API call ─────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit): Promise<string> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return 'Success';
  const data = await res.json();
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

// ── Code Node tools (work via DOM when a Code Node config is open) ────────────

const readCode: AssistantTool = {
  name: 'read_code',
  description: 'Read the current code in the Code Node editor. Open a Code Node config first.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    // Find the code editor by looking for the TextField with label "JavaScript Code"
    const modal = document.querySelector('.fixed.inset-0.z-50');
    if (!modal) return 'No code editor found. Open a Code Node configuration panel first.';
    const labels = modal.querySelectorAll('span.text-xs.font-medium, span.text-sm.font-medium, label');
    for (const label of labels) {
      if (label.textContent?.trim() === 'JavaScript Code') {
        const container = label.closest('.relative') || label.parentElement?.closest('.space-y-3');
        if (container) {
          const ta = container.querySelector('textarea');
          if (ta) return ta.value || '(empty)';
        }
      }
    }
    // Fallback: try the TextField's textarea directly
    const codeField = findModalField('JavaScript Code');
    if (codeField) return (codeField as HTMLTextAreaElement).value || '(empty)';
    return 'No code editor found. Open a Code Node configuration panel first.';
  },
};

const replaceCode: AssistantTool = {
  name: 'replace_code',
  description: 'Replace the code in the Code Node editor. Call this whenever you produce or modify code.',
  inputSchema: {
    type: 'object',
    properties: { code: { type: 'string', description: 'The new JavaScript code to insert' } },
    required: ['code'],
  },
  async execute({ code }) {
    const field = findModalField('JavaScript Code');
    if (field) {
      reactSetValue(field as HTMLInputElement | HTMLTextAreaElement, code as string);
      return 'Code updated in the editor.';
    }
    return 'No code editor found. Open a Code Node configuration panel first.';
  },
};

// ── Generic DOM helpers for node config modals ──────────────────────────────

// ── DOM helpers for node config panels ──────────────────────────────────────

function getFieldLabel(el: Element): string | null {
  // 1. If the element has an id, check for a label with htmlFor pointing to it
  const elId = el.getAttribute('id');
  if (elId) {
    const forLabel = document.querySelector(`label[for="${elId}"]`);
    if (forLabel) return forLabel.textContent?.trim() || null;
  }
  // 2. Check the nearest preceding span with label class (sibling before the input)
  let prev = el.previousElementSibling;
  while (prev) {
    if (prev.matches('span.text-xs.font-medium, span.text-sm.font-medium')) return prev.textContent?.trim() || null;
    prev = prev.previousElementSibling;
  }
  // 3. Check parent label
  const parent = el.closest('label');
  if (parent) {
    const span = parent.querySelector('span.text-xs.font-medium, span.text-sm.font-medium');
    if (span) return span.textContent?.trim() || null;
  }
  // 4. Fallback to placeholder
  return el.getAttribute('placeholder') || null;
}

function findModalField(label: string): HTMLElement | null {
  const modal = document.querySelector('.fixed.inset-0.z-50');
  if (!modal) return null;
  for (const el of modal.querySelectorAll('input, textarea, select')) {
    if (getFieldLabel(el) === label) return el as HTMLElement;
  }
  return null;
}

function reactSetValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el), 'value'
  )?.set;
  nativeSetter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── Node config tools (work with any open node config panel) ─────────────────

const getNodeConfig: AssistantTool = {
  name: 'get_node_config',
  description: 'Read all configuration fields from the currently open node config panel. Works with any node type.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    const modal = document.querySelector('.fixed.inset-0.z-50');
    if (!modal) return 'No node config panel is open. Double-click a node to open it.';
    const fields: Record<string, string> = {};

    modal.querySelectorAll('input, textarea, select').forEach((el: any) => {
      const name = getFieldLabel(el) || el.placeholder || el.name || 'unknown';
      if (el.type === 'checkbox') fields[name] = el.checked ? 'true' : 'false';
      else fields[name] = norm(el.value || '');
    });

    // Also read the button list for HITL nodes
    const buttonItems = modal.querySelectorAll('.space-y-2 .flex.items-center.gap-2 input');
    if (buttonItems.length > 0) {
      const buttons: { label: string; value: string }[] = [];
      buttonItems.forEach((el, i) => { const input = el as HTMLInputElement;
        if (i % 2 === 0) buttons.push({ label: input.value, value: '' });
        else buttons[buttons.length - 1].value = input.value;
      });
      fields['buttons'] = JSON.stringify(buttons);
    }

    return JSON.stringify(fields, null, 2);
  },
};

const updateNodeField: AssistantTool = {
  name: 'update_node_field',
  description: 'Update a specific field in the open node config panel. Provide the exact label text and the new value.',
  inputSchema: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'The exact label text of the field (e.g. "System Prompt", "Condition Expression", "Allow reviewer feedback")' },
      value: { type: 'string', description: 'The new value to set. For checkboxes use "true" or "false".' },
    },
    required: ['label', 'value'],
  },
  async execute({ label, value }) {
    const field = findModalField(label);
    if (!field) return `Field "${label}" not found. Open the node config panel first.`;

    if ((field as HTMLInputElement).type === 'checkbox') {
      const cb = field as HTMLInputElement;
      const checked = value === 'true' || value === '1';
      if (cb.checked !== checked) {
        cb.click();
      }
      return `Set checkbox "${label}" to ${checked}.`;
    }

    if (field.tagName === 'SELECT') {
      const sel = field as HTMLSelectElement;
      const cleanValue = norm(value);
      const matchingOption = Array.from(sel.options).find(o => norm(o.value) === cleanValue);
      if (!matchingOption) {
        const available = Array.from(sel.options).map(o => norm(o.value) || '(empty)').filter(Boolean).join(', ');
        return `Value "${value}" is not a valid option for "${label}". Available options: ${available}`;
      }
      sel.value = matchingOption.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return `Set select "${label}" to "${matchingOption.value}".`;
    }

    reactSetValue(field as HTMLInputElement | HTMLTextAreaElement, value);
    return `Updated "${label}".`;
  },
};

const getAvailableNodes: AssistantTool = {
  name: 'get_available_nodes',
  description: 'List all node types available in the node catalog for adding to the flow.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    return 'Available node types: llm-agent (calls an LLM), mcp-tool (calls an MCP tool), retriever (vector search), code (JavaScript), branch (condition routing), hitl (human approval — simple approve/reject or multi-approver), output (returns result), parallel (concurrent branches). Click the + button on the left to open the catalog, then select a node type. The trigger node is pre-added and cannot be removed.';
  },
};

// ── Flow editor tools ───────────────────────────────────────────────────────

const openNode: AssistantTool = {
  name: 'open_node',
  description: 'Click on a node in the flow canvas by its label to open its config panel. Use this before get_node_config or update_node_field.',
  inputSchema: {
    type: 'object',
    properties: { label: { type: 'string', description: 'The label or type of the node (e.g. "trigger", "llm-agent", "hitl", or a custom label)' } },
    required: ['label'],
  },
  async execute({ label }) {
    const nodes = document.querySelectorAll('.react-flow__node');
    if (nodes.length === 0) return 'No nodes found on the canvas. Open a flow in the editor first.';
    for (const node of nodes) {
      if (node.textContent?.toLowerCase().includes((label as string).toLowerCase())) {
        (node as HTMLElement).click();
        return `Clicked on node matching "${label}". The config panel should now be open.`;
      }
    }
    return `No node found matching "${label}". Available nodes: ${[...nodes].map(n => n.textContent?.trim()).join(', ')}`;
  },
};

const getFlowJson: AssistantTool = {
  name: 'get_flow_json',
  description: 'Get the full flow definition as JSON. Use this to inspect the current flow structure and node configurations.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    if (typeof window === 'undefined') return 'Not in a browser.';
    const match = window.location.pathname.match(/\/flows\/([^/]+)\/edit/);
    if (!match) return 'Not on a flow editor page. Open a flow in the editor first.';
    const canvasNodes = (window as any).__flowCanvasNodes;
    const canvasEdges = (window as any).__flowCanvasEdges;
    if (!canvasNodes) return apiFetch(`/flows/${match[1]}`); // fallback to API

    const flow = JSON.parse(await apiFetch(`/flows/${match[1]}`));
    flow.nodes = canvasNodes;
    flow.edges = canvasEdges;
    return JSON.stringify(flow, null, 2);
  },
};

const updateFlow: AssistantTool = {
  name: 'update_flow',
  description: 'Update the flow name and/or description without reloading the page.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'New name for the flow (optional)' },
      description: { type: 'string', description: 'New description for the flow (optional)' },
    },
  },
  async execute({ name, description }) {
    const match = typeof window !== 'undefined' ? window.location.pathname.match(/\/flows\/([^/]+)\/edit/) : null;
    if (!match) return 'Not on a flow editor page.';
    const flow = JSON.parse(await apiFetch(`/flows/${match[1]}`));
    if (name) flow.name = name;
    if (description !== undefined) flow.description = description;
    await apiFetch(`/flows/${match[1]}`, { method: 'PUT', body: JSON.stringify(flow) });
    // Update name input in DOM
    const topbar = document.querySelector('.fixed.inset-x-0.top-3');
    if (name && topbar) {
      const inputs = topbar.querySelectorAll('input');
      if (inputs[0]) {
        const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inputs[0]), 'value')?.set;
        nativeSetter?.call(inputs[0], name);
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    // Update description input in DOM
    if (description !== undefined && topbar) {
      const inputs = topbar.querySelectorAll('input');
      if (inputs[1]) {
        const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inputs[1]), 'value')?.set;
        nativeSetter?.call(inputs[1], description);
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    return `Flow updated${name ? `: name → "${name}"` : ''}${description ? `: description → "${description}"` : ''}.`;
  },
};

const addNode: AssistantTool = {
  name: 'add_node',
  description: 'Add a new node to the flow canvas',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['llm-agent', 'code', 'branch', 'output', 'hitl', 'mcp-tool', 'retriever', 'parallel'] },
    },
    required: ['type'],
  },
  async execute({ type }) {
    const addFn = (window as any).__addFlowNode;
    if (!addFn) return 'Not available — open a flow in the editor first.';
    addFn(type as string, {});
    return `Added a "${type}" node to the canvas.`;
  },
};

const deleteNode: AssistantTool = {
  name: 'delete_node',
  description: 'Delete a node from the flow canvas by its label.',
  inputSchema: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'The label or type of the node to delete (e.g. "stop", "llm-agent", "trigger")' },
    },
    required: ['label'],
  },
  async execute({ label }) {
    const nodes = document.querySelectorAll('.react-flow__node');
    if (nodes.length === 0) return 'No nodes found on the canvas. Open a flow in the editor first.';
    for (const node of nodes) {
      if (node.textContent?.toLowerCase().includes((label as string).toLowerCase())) {
        const deleteFn = (window as any).__deleteFlowNode;
        if (!deleteFn) return 'Delete function not available. Make sure FlowEditor is loaded.';
        const nodeId = node.getAttribute('data-id');
        if (!nodeId) return 'Could not find node ID for the selected node.';
        deleteFn(nodeId);
        return `Deleted node matching "${label}".`;
      }
    }
    return `No node found matching "${label}". Available nodes: ${[...nodes].map(n => n.textContent?.trim()).join(', ')}`;
  },
};

const removeEdge: AssistantTool = {
  name: 'remove_edge',
  description: 'Remove an edge (connection) between two nodes on the flow canvas by their labels.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Label of the source node' },
      target: { type: 'string', description: 'Label of the target node' },
      sourceHandle: { type: 'string', description: 'Optional handle id on the source node (e.g. "output-1")' },
    },
    required: ['source', 'target'],
  },
  async execute({ source, target, sourceHandle }) {
    const removeFn = (window as any).__removeFlowEdge;
    if (!removeFn) return 'Remove edge function not available. Make sure FlowEditor is loaded.';
    const nodes = document.querySelectorAll('.react-flow__node');
    let sourceId: string | null = null;
    let targetId: string | null = null;
    for (const node of nodes) {
      const text = node.textContent?.toLowerCase() || '';
      if (text.includes((source as string).toLowerCase())) sourceId = node.getAttribute('data-id');
      if (text.includes((target as string).toLowerCase())) targetId = node.getAttribute('data-id');
    }
    if (!sourceId) return `Source node "${source}" not found.`;
    if (!targetId) return `Target node "${target}" not found.`;
    removeFn(sourceId, targetId, sourceHandle || undefined);
    return `Removed edge from "${source}" → "${target}".`;
  },
};

const saveFlow: AssistantTool = {
  name: 'save_flow',
  description: 'Save the current flow (nodes, edges, name, description) to the database.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    const canvasNodes = (window as any).__flowCanvasNodes;
    const canvasEdges = (window as any).__flowCanvasEdges;
    if (!canvasNodes) return 'No canvas state found. Open a flow in the editor first.';
    const match = typeof window !== 'undefined' ? window.location.pathname.match(/\/flows\/([^/]+)\/edit/) : null;
    if (!match) return 'Not on a flow editor page.';
    const flow = JSON.parse(await apiFetch(`/flows/${match[1]}`));
    flow.nodes = canvasNodes;
    flow.edges = canvasEdges;
    await apiFetch(`/flows/${match[1]}`, { method: 'PUT', body: JSON.stringify(flow) });
    return 'Flow saved successfully.';
  },
};

const runFlow: AssistantTool = {
  name: 'run_flow',
  description: 'Run the current flow (debug mode). Opens the debug overlay.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    const match = typeof window !== 'undefined' ? window.location.pathname.match(/\/flows\/([^/]+)\/edit/) : null;
    if (!match) return 'Not on a flow editor page.';
    window.location.href = `/flows/${match[1]}/edit?debug=1`;
    return 'Opened flow in debug mode.';
  },
};

const closeNodeConfig: AssistantTool = {
  name: 'close_node_config',
  description: 'Close the currently open node configuration panel.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    // Try clicking the close/X button in the modal
    const closeBtn = document.querySelector('.fixed.inset-0.z-50 button[aria-label="Close"], .fixed.inset-0.z-50 .material-symbols-outlined')?.closest('button');
    if (closeBtn) {
      (closeBtn as HTMLElement).click();
      return 'Closed the node config panel.';
    }
    // Fallback: try Escape key
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return 'Sent Escape key to close the node config panel.';
  },
};

const connectNodes: AssistantTool = {
  name: 'connect_nodes',
  description: 'Connect two nodes on the flow canvas by their labels.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Label of the source node' },
      target: { type: 'string', description: 'Label of the target node' },
      sourceHandle: { type: 'string', description: 'Optional handle id on the source node (e.g. "output-1" for second output)' },
    },
    required: ['source', 'target'],
  },
  async execute({ source, target, sourceHandle }) {
    const nodes = document.querySelectorAll('.react-flow__node');
    if (nodes.length === 0) return 'No nodes found on the canvas. Open a flow in the editor first.';
    let sourceId: string | null = null;
    let targetId: string | null = null;
    for (const node of nodes) {
      const text = node.textContent?.toLowerCase() || '';
      if (text.includes((source as string).toLowerCase())) sourceId = node.getAttribute('data-id');
      if (text.includes((target as string).toLowerCase())) targetId = node.getAttribute('data-id');
    }
    if (!sourceId) return `Source node "${source}" not found.`;
    if (!targetId) return `Target node "${target}" not found.`;
    const connectFn = (window as any).__connectFlowNodes;
    if (!connectFn) return 'Connect function not available. Make sure FlowEditor is loaded.';
    connectFn(sourceId, targetId, sourceHandle || undefined);
    return `Connected "${source}" → "${target}".`;
  },
};

// ── LLM Endpoints CRUD ───────────────────────────────────────────────────────

const listEndpoints: AssistantTool = {
  name: 'list_endpoints',
  description: 'List all configured LLM endpoints (providers, models, default status)',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/llm-endpoints'); },
};

const createEndpoint: AssistantTool = {
  name: 'create_endpoint',
  description: 'Add a new LLM endpoint. Requires name, providerType (anthropic/openai/litellm), apiKey, defaultModel.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Display name' },
      providerType: { type: 'string', enum: ['anthropic', 'openai', 'litellm'] },
      apiKey: { type: 'string' },
      defaultModel: { type: 'string' },
      baseUrl: { type: 'string', description: 'Base URL (required for LiteLLM)' },
    },
    required: ['name', 'providerType', 'apiKey', 'defaultModel'],
  },
  async execute({ name, providerType, apiKey, defaultModel, baseUrl }) {
    return apiFetch('/llm-endpoints', {
      method: 'POST',
      body: JSON.stringify({ name, providerType, apiKey, defaultModel, baseUrl }),
    });
  },
};

const deleteEndpoint: AssistantTool = {
  name: 'delete_endpoint',
  description: 'Delete an LLM endpoint by ID. Cannot delete the default endpoint.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Endpoint ID' } },
    required: ['id'],
  },
  async execute({ id }) {
    await apiFetch(`/llm-endpoints/${id}`, { method: 'DELETE' });
    return 'Endpoint deleted';
  },
};

// ── MCP Servers CRUD ─────────────────────────────────────────────────────────

const listMcpServers: AssistantTool = {
  name: 'list_mcp_servers',
  description: 'List all configured MCP servers with their tool counts and status',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/mcp-servers'); },
};

const createMcpServer: AssistantTool = {
  name: 'create_mcp_server',
  description: 'Add a new MCP server. Requires name and url.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      url: { type: 'string', description: 'MCP server URL' },
    },
    required: ['name', 'url'],
  },
  async execute({ name, url }) { return apiFetch('/mcp-servers', { method: 'POST', body: JSON.stringify({ name, url }) }); },
};

const deleteMcpServer: AssistantTool = {
  name: 'delete_mcp_server',
  description: 'Delete an MCP server by ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/mcp-servers/${id}`, { method: 'DELETE' }); },
};

const refreshMcpTools: AssistantTool = {
  name: 'refresh_mcp_tools',
  description: 'Refresh the tool list from an MCP server by its ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'The MCP server ID' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/mcp-servers/${id}/refresh`, { method: 'POST' }); },
};

// ── Embedding Providers ───────────────────────────────────────────────────────

const listEmbeddingProviders: AssistantTool = {
  name: 'list_embedding_providers',
  description: 'List all configured embedding providers',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/embedding-providers'); },
};

const createEmbeddingProvider: AssistantTool = {
  name: 'create_embedding_provider',
  description: 'Add a new embedding provider. Requires name, providerType (openai/litellm), apiKey. Note: the worker always uses the OpenAI SDK, so litellm only works when configured as an OpenAI-compatible proxy. Anthropic is not supported for embeddings.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      providerType: { type: 'string', enum: ['openai', 'litellm'] },
      apiKey: { type: 'string' },
      model: { type: 'string', description: 'Model name (default: text-embedding-ada-002)' },
    },
    required: ['name', 'providerType', 'apiKey'],
  },
  async execute({ name, providerType, apiKey, model }) {
    return apiFetch('/embedding-providers', { method: 'POST', body: JSON.stringify({ name, providerType, apiKey, model }) });
  },
};

const deleteEmbeddingProvider: AssistantTool = {
  name: 'delete_embedding_provider',
  description: 'Delete an embedding provider by ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/embedding-providers/${id}`, { method: 'DELETE' }); },
};

// ── Vector Stores ──────────────────────────────────────────────────────────────

const listVectorStores: AssistantTool = {
  name: 'list_vector_stores',
  description: 'List all configured vector stores',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/vector-stores'); },
};

const createVectorStore: AssistantTool = {
  name: 'create_vector_store',
  description: 'Add a new vector store. Requires name, url, and optional apiKey.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      url: { type: 'string', description: 'Qdrant server URL' },
      apiKey: { type: 'string' },
    },
    required: ['name', 'url'],
  },
  async execute({ name, url, apiKey }) {
    return apiFetch('/vector-stores', { method: 'POST', body: JSON.stringify({ name, url, apiKey }) });
  },
};

const deleteVectorStore: AssistantTool = {
  name: 'delete_vector_store',
  description: 'Delete a vector store by ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/vector-stores/${id}`, { method: 'DELETE' }); },
};

// ── Users ──────────────────────────────────────────────────────────────────────

const listUsers: AssistantTool = {
  name: 'list_users',
  description: 'List all users with their roles',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/users'); },
};

const createUser: AssistantTool = {
  name: 'create_user',
  description: 'Create a new user account. Requires email, password (min 8 chars), and name.',
  inputSchema: {
    type: 'object',
    properties: {
      email: { type: 'string' },
      password: { type: 'string', description: 'Minimum 8 characters' },
      name: { type: 'string' },
    },
    required: ['email', 'password', 'name'],
  },
  async execute({ email, password, name }) {
    return apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
  },
};

const deleteUser: AssistantTool = {
  name: 'delete_user',
  description: 'Delete a user by ID',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/users/${id}`, { method: 'DELETE' }); },
};

const updateUserRole: AssistantTool = {
  name: 'update_user_role',
  description: "Change a user's role. Provide userId and roleId.",
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      roleId: { type: 'string', description: 'The role ID to assign' },
    },
    required: ['userId', 'roleId'],
  },
  async execute({ userId, roleId }) {
    return apiFetch(`/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role_id: roleId }) });
  },
};

// ── Approvals ─────────────────────────────────────────────────────────────────

const getPendingApprovals: AssistantTool = {
  name: 'get_pending_approvals',
  description: 'List all executions currently awaiting human approval',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/executions/pending'); },
};

const approveExecution: AssistantTool = {
  name: 'approve_execution',
  description: 'Approve a HITL-paused execution by its ID',
  inputSchema: {
    type: 'object',
    properties: {
      executionId: { type: 'string', description: 'The execution ID to approve' },
      decision: { type: 'string', description: 'The decision value (e.g. "approved")' },
    },
    required: ['executionId', 'decision'],
  },
  async execute({ executionId, decision }) {
    return apiFetch(`/executions/${executionId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
  },
};

const rejectExecution: AssistantTool = {
  name: 'reject_execution',
  description: 'Reject a HITL-paused execution by its ID, setting it to cancelled',
  inputSchema: {
    type: 'object',
    properties: { executionId: { type: 'string', description: 'The execution ID to reject' } },
    required: ['executionId'],
  },
  async execute({ executionId }) {
    return apiFetch(`/executions/${executionId}/reject`, { method: 'POST' });
  },
};

// ── Executions ────────────────────────────────────────────────────────────────

// ── Flow listing ──────────────────────────────────────────────────────────────

const listFlows: AssistantTool = {
  name: 'list_flows',
  description: 'List all flows with their names, descriptions, and IDs.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    return apiFetch('/flows?limit=100');
  },
};

const searchFlows: AssistantTool = {
  name: 'search_flows',
  description: 'Search flows by name or description. Returns matching flows with IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term to match against flow name or description' },
    },
    required: ['query'],
  },
  async execute({ query }) {
    return apiFetch(`/flows?limit=100&search=${encodeURIComponent(query as string)}`);
  },
};

// ── Navigation ────────────────────────────────────────────────────────────────

const navigateTo: AssistantTool = {
  name: 'navigate_to',
  description: 'Navigate to a page or open a specific flow editor in the app.',
  inputSchema: {
    type: 'object',
    properties: {
      page: { type: 'string', enum: ['flows', 'approvals', 'settings', 'settings/endpoints', 'settings/mcp-servers', 'settings/knowledge', 'settings/users', 'settings/secrets', 'settings/secret-vaults', 'profile'] },
      flowId: { type: 'string', description: 'Flow ID to open directly in the editor (e.g. "f30fa521-...")' },
      reason: { type: 'string', description: 'What the user wants to do on the target page (e.g. "add an MCP server", "edit endpoint settings")' },
    },
  },
  async execute({ page, flowId, reason }) {
    if (typeof window === 'undefined') return 'Navigation not available.';
    const dest = flowId ? `/flows/${flowId}/edit` : `/${page}`;
    try { sessionStorage.setItem('copilot:redirect', reason ? `The user wants to: ${reason}. Help them with that.` : `The user was redirected here. Ask what they'd like to do.`); } catch {}
    window.location.href = dest;
    return `Navigated to ${dest}.`;
  },
};

// ── Profile ──────────────────────────────────────────────────────────────────

const updateProfile: AssistantTool = {
  name: 'update_profile',
  description: 'Update your profile name and/or email.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'New display name' },
      email: { type: 'string', description: 'New email address' },
    },
  },
  async execute({ name, email }) {
    return apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify({ name, email }) });
  },
};

// ── Executions ────────────────────────────────────────────────────────────────

const listExecutions: AssistantTool = {
  name: 'list_executions',
  description: 'Get execution history (last 100 executions across all flows)',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/executions'); },
};

const getExecutionDetails: AssistantTool = {
  name: 'get_execution_details',
  description: 'Get detailed step-by-step trace for a specific execution',
  inputSchema: {
    type: 'object',
    properties: { executionId: { type: 'string', description: 'The execution ID' } },
    required: ['executionId'],
  },
  async execute({ executionId }) { return apiFetch(`/executions/${executionId}`); },
};

const deleteExecution: AssistantTool = {
  name: 'delete_execution',
  description: 'Delete an execution and all its step data by ID',
  inputSchema: {
    type: 'object',
    properties: { executionId: { type: 'string', description: 'The execution ID to delete' } },
    required: ['executionId'],
  },
  async execute({ executionId }) { return apiFetch(`/executions/${executionId}`, { method: 'DELETE' }); },
};

// ── Secrets CRUD ─────────────────────────────────────────────────────────────────

const listSecrets: AssistantTool = {
  name: 'list_secrets',
  description: 'List all secrets with optional filtering by scope, scopeId, or search term.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: { type: 'string', description: 'Filter by scope (e.g. "endpoint", "global")' },
      scopeId: { type: 'string', description: 'Filter by scope-specific ID' },
      search: { type: 'string', description: 'Search term to filter secrets by name' },
    },
  },
  async execute({ scope, scopeId, search }) {
    const params = new URLSearchParams();
    if (scope) params.set('scope', scope as string);
    if (scopeId) params.set('scopeId', scopeId as string);
    if (search) params.set('search', search as string);
    const qs = params.toString();
    return apiFetch(`/secrets${qs ? `?${qs}` : ''}`);
  },
};

const createSecret: AssistantTool = {
  name: 'create_secret',
  description: 'Create a new secret. Requires name, value, scope, and scopeId.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      value: { type: 'string', description: 'The secret value to store' },
      scope: { type: 'string' },
      scopeId: { type: 'string' },
    },
    required: ['name', 'value', 'scope', 'scopeId'],
  },
  async execute({ name, value, scope, scopeId }) {
    return apiFetch('/secrets', { method: 'POST', body: JSON.stringify({ name, value, scope, scopeId }) });
  },
};

const updateSecret: AssistantTool = {
  name: 'update_secret',
  description: 'Update an existing secret value by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Secret ID' },
      value: { type: 'string', description: 'New secret value' },
    },
    required: ['id', 'value'],
  },
  async execute({ id, value }) {
    return apiFetch(`/secrets/${id}`, { method: 'PUT', body: JSON.stringify({ value }) });
  },
};

const deleteSecret: AssistantTool = {
  name: 'delete_secret',
  description: 'Delete a secret by ID.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Secret ID' } },
    required: ['id'],
  },
  async execute({ id }) { return apiFetch(`/secrets/${id}`, { method: 'DELETE' }); },
};

const rotateKey: AssistantTool = {
  name: 'rotate_key',
  description: 'Rotate the root encryption key used to encrypt secrets at rest.',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/secrets/rotate-key', { method: 'POST' }); },
};

// ── Secret Vaults CRUD ─────────────────────────────────────────────────────────

const listVaults: AssistantTool = {
  name: 'list_vaults',
  description: 'List all configured secret vaults (external vault providers).',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/secret-vaults'); },
};

const testVaultConnection: AssistantTool = {
  name: 'test_vault_connection',
  description: 'Test the connection to a secret vault by its ID.',
  inputSchema: {
    type: 'object',
    properties: { vaultId: { type: 'string', description: 'Vault ID to test' } },
    required: ['vaultId'],
  },
  async execute({ vaultId }) { return apiFetch(`/secret-vaults/${vaultId}/test`, { method: 'POST' }); },
};

// ── Group vault config ──────────────────────────────────────────────────────────

const listGroups: AssistantTool = {
  name: 'list_groups',
  description: 'List all groups (teams) in the system.',
  inputSchema: { type: 'object', properties: {} },
  async execute() { return apiFetch('/groups'); },
};

const getGroupVault: AssistantTool = {
  name: 'get_group_vault',
  description: 'Get the vault configuration for a specific group.',
  inputSchema: {
    type: 'object',
    properties: { groupId: { type: 'string', description: 'Group ID' } },
    required: ['groupId'],
  },
  async execute({ groupId }) { return apiFetch(`/group-vault-config/${groupId}`); },
};

const setGroupVault: AssistantTool = {
  name: 'set_group_vault',
  description: 'Set the vault configuration for a group. Optionally enable/disable vault access.',
  inputSchema: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: 'Group ID' },
      vaultId: { type: 'string', description: 'Vault ID to associate with the group' },
      enabled: { type: 'boolean', description: 'Whether vault access is enabled for this group' },
    },
    required: ['groupId', 'vaultId'],
  },
  async execute({ groupId, vaultId, enabled }) {
    return apiFetch(`/group-vault-config/${groupId}`, { method: 'PUT', body: JSON.stringify({ vaultId, enabled }) });
  },
};

// ── Tool groups ──────────────────────────────────────────────────────────────────

export const toolGroups: Record<string, AssistantTool[]> = {
  'navigation': [navigateTo],
  'flow-editor': [openNode, getFlowJson, updateFlow, saveFlow, runFlow, addNode, deleteNode, connectNodes, removeEdge, closeNodeConfig, getNodeConfig, updateNodeField, getAvailableNodes, readCode, replaceCode, listFlows, searchFlows],
  'endpoint-crud': [listEndpoints, createEndpoint, deleteEndpoint],
  'mcp-crud': [listMcpServers, createMcpServer, deleteMcpServer, refreshMcpTools],
  'embedding-crud': [listEmbeddingProviders, createEmbeddingProvider, deleteEmbeddingProvider],
  'store-crud': [listVectorStores, createVectorStore, deleteVectorStore],
  'user-crud': [listUsers, createUser, deleteUser, updateUserRole],
  'profile-crud': [updateProfile],
  'flows-list': [listFlows, searchFlows],
  'approvals': [getPendingApprovals, approveExecution, rejectExecution],
  'executions': [listExecutions, getExecutionDetails, deleteExecution],
  'secret-crud': [listSecrets, createSecret, updateSecret, deleteSecret, rotateKey],
  'vault-crud': [listVaults, testVaultConnection],
  'group-vault-config': [listGroups, getGroupVault, setGroupVault],
  'chat': [],
  'read-resources': [listEndpoints, listMcpServers, listEmbeddingProviders, listVectorStores],
};

// ── Registry: page key pattern → tool group names ──────────────────────────────

export function getToolGroupNames(pageKey: string, nodeType?: string): string[] {
  const groups: string[] = ['navigation'];

  if (pageKey?.startsWith('flow:')) groups.push('flow-editor', 'read-resources');
  else if (pageKey === 'settings:endpoints') groups.push('endpoint-crud');
  else if (pageKey === 'settings:mcp-servers') groups.push('mcp-crud');
  else if (pageKey === 'settings:knowledge') groups.push('embedding-crud', 'store-crud');
  else if (pageKey === 'settings:users') groups.push('user-crud');
  else if (pageKey === 'settings:secrets') groups.push('secret-crud', 'group-vault-config');
  else if (pageKey === 'settings:secret-vaults') groups.push('vault-crud');
  else if (pageKey === 'approvals') groups.push('approvals');
  else if (pageKey?.startsWith('executions:')) groups.push('executions');
  else if (pageKey === 'profile') groups.push('profile-crud');
  else if (pageKey === 'flows-list') groups.push('flows-list');
  else if (pageKey?.startsWith('chat:')) groups.push('chat');
  else if (pageKey?.startsWith('chat-sessions:')) groups.push('chat');

  return groups;
}

export function getToolsForPage(pageKey: string, nodeType?: string): AssistantTool[] {
  const groupNames = getToolGroupNames(pageKey, nodeType);
  const tools: AssistantTool[] = [];
  for (const name of groupNames) {
    const group = toolGroups[name];
    if (group) tools.push(...group);
  }
  return tools;
}

