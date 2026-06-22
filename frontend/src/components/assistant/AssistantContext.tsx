import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getToolsForPage as getTools } from './tools/registry';
import { useConversationMemory } from './useConversationMemory';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface AssistantTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: any) => Promise<string>;
}

export interface PageContext {
  pageKey: string;
  description: string;
  data?: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  timestamp: number;
}

interface AssistantContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  messages: Message[];
  streaming: boolean;
  streamingContent: string;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearConversation: () => void;
  pageContext: PageContext | null;
  setPageContext: (ctx: PageContext) => void;
  activeTools: AssistantTool[];
  setActiveTools: (tools: AssistantTool[]) => void;
  defaultEndpointId: string | null;
  getToolsForPage: (pageKey: string, nodeType?: string) => AssistantTool[];
}

const AssistantContext = createContext<AssistantContextType>({} as AssistantContextType);

// ── Page capability descriptions (accurate per-page) ─────────────────────────

function getPageCapabilities(pageKey: string): string {
  if (pageKey.startsWith('flow:')) {
    return 'This page shows the visual flow editor canvas. You can add/delete/edit nodes, connect them, and configure their settings. Opening a node shows a config panel with fields specific to that node type (system prompt, condition, code, etc.). The left panel has a node catalog.';
  }
  if (pageKey === 'flows-list') {
    return 'This page shows a list of all flows with their name, description, and version. Each flow has action buttons to run (execute once), chat (conversational interface), debug (step-through), view execution history, and delete. The "New Flow" button creates a new blank flow. There is no search/filter, no export/import, no grid/list toggle.';
  }
  if (pageKey.startsWith('executions:')) {
    return 'This page shows execution history for a flow. Each execution shows status, duration, and timestamps. Click one to see step-by-step details with input/output/error for each node. Pending HITL approvals link to the approvals page.';
  }
  if (pageKey === 'approvals') {
    return 'This page shows all executions awaiting human approval. Each card shows the HITL prompt (markdown rendered), a feedback textarea (when enabled), and configurable action buttons from the HITL node config.';
  }
  if (pageKey === 'settings:endpoints') {
    return 'This page lists LLM endpoint configurations (name, provider, model). You can create, edit, and delete endpoints. Each endpoint has an API key (shown masked), provider type (Anthropic/OpenAI/LiteLLM), base URL, default model, and model list. One endpoint can be marked as default for the Co-Pilot.';
  }
  if (pageKey === 'settings:mcp-servers') {
    return 'This page lists MCP server configurations (name, URL, enabled status, tool count). You can add new MCP servers, edit their URL/name, toggle enabled, or delete them. The refresh button re-fetches available tools from the server.';
  }
  if (pageKey === 'settings:knowledge') {
    return 'This page has two sections: Embedding Providers (configure embedding API endpoints for RAG) and Vector Stores (configure Qdrant connections). You can create, edit, and delete both using the available tools.';
  }
  if (pageKey === 'settings:users') {
    return 'This page shows a table of all users with their name, email, role (editable dropdown), provider, and last login. You can create users, change roles, and delete users using the available tools.';
  }
  if (pageKey === 'profile') {
    return 'This page shows your profile: name, email, role, permissions, provider, member since date, and last login. You can edit your name and email. There are no avatars, themes, API keys, or subscriptions.';
  }
  if (pageKey.startsWith('settings:')) {
    return 'This is a settings sub-page with configuration options. Available features are visible in the page content.';
  }
  return '';
}

// ── Build page-aware system prompt ─────────────────────────────────────────────

function buildSystemPrompt(pageContext: PageContext | null, tools: AssistantTool[]): string {
  const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  const capabilities = pageContext?.pageKey ? getPageCapabilities(pageContext.pageKey) : '';
  return [
    'You are Co-Pilot, an AI assistant for Core Agents — a visual LLM agent builder.',
    '',
    `Current page: ${pageContext?.description || 'Unknown page'}`,
    '',
    ...(capabilities ? [`Page capabilities:\n${capabilities}`, ''] : ['']),
    'Available tools:',
    toolList || '  (none for this page)',
    '',
    'Rules:',
    '- Keep responses concise. Use markdown only for code blocks and short lists.',
    '- When you write or modify code for a Code Node, call replace_code immediately.',
    '- If a tool is available and relevant, use it — don\'t just describe what you could do.',
    '- If a tool fails, explain the error clearly.',
    '- If you need more information, ask the user.',
    '- If asked what you can do, describe your available tools — do not invent features not listed in the Page capabilities section above.',
    '- You cannot access external URLs or APIs beyond the provided tools.',
    '- Keep using tools until the entire task is fully complete. Never say "let me do X next" — just call the tool and do it immediately. Only respond with plain text when every single requested change has been executed.',
  ].join('\n');
}

// ── Provider ────────────────────────────────────────────────────────────────────

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && localStorage.getItem('copilot:open') === 'true');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [activeTools, setActiveTools] = useState<AssistantTool[]>([]);
  const [defaultEndpointId, setDefaultEndpointId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const memory = useConversationMemory();

  // Prefix memory keys with userId so different users never share history
  const memKey = useCallback((pageKey: string) => `${user?.id || 'anon'}:${pageKey}`, [user?.id]);

  // Persist panel open/close state across page navigations
  const handleSetOpen = useCallback((val: boolean) => {
    setOpen(val);
    try { localStorage.setItem('copilot:open', String(val)); } catch {}
  }, []);
  const toggle = useCallback(() => handleSetOpen(!open), [open]);

  // Generate welcome message for a page — keep it grounded, no feature lists
  const welcomeMessage = useCallback((description: string): Message => ({
    id: `welcome_${Date.now()}`,
    role: 'assistant',
    content: `👋 Hi! I'm Co-Pilot, your AI assistant.\n\nYou're on the **${description}** page. I can answer questions and help you with tasks using the tools I have available.\n\nWhat would you like to do?`,
    timestamp: Date.now(),
  }), []);

  // Load default endpoint on mount
  useEffect(() => {
    fetch(`${API}/llm-endpoints/default`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.id) setDefaultEndpointId(data.id); })
      .catch(() => {});
  }, []);

  // Save/restore conversation on page context change
  const prevKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pageContext?.pageKey) return;
    const prevKey = prevKeyRef.current;
    if (prevKey && prevKey !== pageContext.pageKey) {
      memory.save(memKey(prevKey), messages);
    }
    prevKeyRef.current = pageContext.pageKey;
    const saved = memory.load(memKey(pageContext.pageKey));
    if (saved.length > 0) {
      setMessages(saved);
    } else {
      // Show welcome message on first visit to this page
      setMessages([welcomeMessage(pageContext.description)]);
    }
  }, [pageContext?.pageKey]);

  // Permission check: tool → required permission map
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

  // Reload tools when page context or node type changes
  useEffect(() => {
    if (!pageContext?.pageKey) return;
    const nodeType = pageContext.data?.nodeType as string | undefined;
    const tools = getTools(pageContext.pageKey, nodeType);
    // Only include tools the user has permission to use
    setActiveTools(tools.filter(t => !toolPerms[t.name] || user?.permissions?.includes(toolPerms[t.name])));
  }, [pageContext?.pageKey, pageContext?.data?.nodeType, user?.permissions]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    if (pageContext?.pageKey) memory.save(memKey(pageContext.pageKey), []);
  }, [pageContext, memory]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    if (!defaultEndpointId) {
      setError('No default LLM endpoint configured. Go to Settings → LLM Endpoints to set one.');
      return;
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setStreaming(true);
    setStreamingContent('');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Build page-aware system prompt
      const systemPrompt = buildSystemPrompt(pageContext, activeTools);

      // Format API messages (exclude tool messages, reconstruct from context)
      const apiMessages = updatedMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      // Tool definitions for the LLM
      const toolDefs = activeTools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));

      const res = await fetch(`${API}/llm/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpointId: defaultEndpointId,
          messages: apiMessages,
          tools: toolDefs,
          systemPrompt,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let toolCalls: { id: string; name: string; input: any }[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'token') {
              assistantContent += event.content;
              setStreamingContent(assistantContent);
            } else if (event.type === 'tool_call') {
              toolCalls.push(event);
            } else if (event.type === 'error') {
              setError(event.message);
            }
          } catch {}
        }
      }

      // Helper to append messages to the visible chat
      const appendMessages = (msgs: Message[]) => {
        setMessages(prev => [...prev, ...msgs]);
      };

      // Tool call loop: up to 5 rounds
      let roundMessages = [...apiMessages];
      let currentToolCalls = toolCalls;

      // Commit the initial assistant response if present
      if (assistantContent) {
        const initialMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: assistantContent, timestamp: Date.now() };
        appendMessages([initialMsg]);
        roundMessages.push({ role: 'assistant' as const, content: assistantContent });
        setStreamingContent('');
      }

      let round = 0;
      while (currentToolCalls.length > 0) {
        // Execute tool calls and show results immediately
        const toolResults: Message[] = [];
        for (const tc of currentToolCalls) {
          const tool = activeTools.find(t => t.name === tc.name);
          if (tool) {
            try {
              const result = await tool.execute(tc.input);
              toolResults.push({ id: crypto.randomUUID(), role: 'tool', content: result, name: tc.name, timestamp: Date.now() });
            } catch (err: any) {
              toolResults.push({ id: crypto.randomUUID(), role: 'tool', content: `Error: ${err.message}`, name: tc.name, timestamp: Date.now() });
            }
          }
        }
        appendMessages(toolResults);

        // Feed results back to LLM
        roundMessages.push(...toolResults.map(t => ({ role: 'user' as const, content: `Tool result (${t.name}): ${t.content}` })));

        const followUp = await fetch(`${API}/llm/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            endpointId: defaultEndpointId,
            messages: roundMessages,
            tools: toolDefs,
            systemPrompt,
          }),
          signal: controller.signal,
        });

        if (!followUp.ok) break;

        const fReader = followUp.body!.getReader();
        let fBuffer = '';
        let responseText = '';
        let newToolCalls: { id: string; name: string; input: any }[] = [];

        while (true) {
          const { done, value } = await fReader.read();
          if (done) break;
          fBuffer += new TextDecoder().decode(value, { stream: true });
          const lines = fBuffer.split('\n');
          fBuffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === 'token') { responseText += ev.content; setStreamingContent(responseText); }
              if (ev.type === 'tool_call') newToolCalls.push(ev);
            } catch {}
          }
        }

        // Commit the follow-up assistant response
        if (responseText) {
          const followUpMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: responseText, timestamp: Date.now() };
          appendMessages([followUpMsg]);
          roundMessages.push({ role: 'assistant' as const, content: responseText });
          setStreamingContent('');
        }

        currentToolCalls = newToolCalls;
        round++;

        // If the LLM described intent but didn't call tools, push it back
        if (currentToolCalls.length === 0 && responseText && /let me|i('ll| will| need to| should| can|'m going to)\b|now the|next (i|we)|time to/i.test(responseText)) {
          roundMessages.push({
            role: 'user' as const,
            content: 'You described what you will do next but did not call any tools. Call the actual tools now — do not describe, just execute.',
          });
          // Re-fetch within this round
          const retryRes = await fetch(`${API}/llm/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              endpointId: defaultEndpointId,
              messages: roundMessages,
              tools: toolDefs,
              systemPrompt,
            }),
            signal: controller.signal,
          });
          if (retryRes.ok) {
            const rReader = retryRes.body!.getReader();
            let rBuffer = '', retryText = '';
            while (true) {
              const { done, value } = await rReader.read();
              if (done) break;
              rBuffer += new TextDecoder().decode(value, { stream: true });
              for (const line of rBuffer.split('\n').filter(l => l.startsWith('data: '))) {
                try {
                  const ev = JSON.parse(line.slice(6));
                  if (ev.type === 'token') { retryText += ev.content; setStreamingContent(retryText); }
                  if (ev.type === 'tool_call') currentToolCalls.push(ev);
                } catch {}
              }
              rBuffer = '';
            }
            if (retryText) {
              const retryMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: retryText, timestamp: Date.now() };
              appendMessages([retryMsg]);
              roundMessages.push({ role: 'assistant' as const, content: retryText });
              setStreamingContent('');
            }
          }
        }

        // Checkup after 8 rounds: ask the LLM if it's stuck
        if (round === 8 && currentToolCalls.length > 0) {
          const checkupMsg = 'You have made 8 tool calls in a row. If you are stuck in a loop, describe the issue to the user and stop. Otherwise, continue with your next tool call.';
          roundMessages.push({ role: 'user' as const, content: checkupMsg });
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setStreaming(false);
      setStreamingContent('');
      abortRef.current = null;
    }
  }, [messages, streaming, defaultEndpointId, activeTools, pageContext, memory]);

  // Save conversation on close
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open && pageContext?.pageKey) {
      memory.save(memKey(pageContext.pageKey), messages);
    }
    prevOpenRef.current = open;
  }, [open, pageContext, messages, memory]);

  return (
    <AssistantContext.Provider value={{
      open, setOpen: handleSetOpen, toggle,
      messages, streaming, streamingContent, error,
      sendMessage, clearConversation,
      pageContext, setPageContext,
      activeTools, setActiveTools,
      defaultEndpointId,
      getToolsForPage: getTools,
    }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  return useContext(AssistantContext);
}
