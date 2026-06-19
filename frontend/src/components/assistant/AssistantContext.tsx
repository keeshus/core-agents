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

// ── Build page-aware system prompt ─────────────────────────────────────────────

function buildSystemPrompt(pageContext: PageContext | null, tools: AssistantTool[]): string {
  const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  return [
    'You are Co-Pilot, an AI assistant for Core Agents — a visual LLM agent builder.',
    '',
    `Current page: ${pageContext?.description || 'Unknown page'}`,
    '',
    'Available tools:',
    toolList || '  (none for this page)',
    '',
    'Rules:',
    '- Keep responses concise. Use markdown for code blocks and lists.',
    '- When you write or modify code for a Code Node, call replace_code immediately.',
    '- If a tool is available and relevant, use it — don\'t just describe what you could do.',
    '- If a tool fails, explain the error clearly.',
    '- If you need more information, ask the user.',
    '- You cannot access external URLs or APIs beyond the provided tools.',
  ].join('\n');
}

// ── Provider ────────────────────────────────────────────────────────────────────

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
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

  const toggle = useCallback(() => setOpen(o => !o), []);

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
    if (saved.length > 0) setMessages(saved);
  }, [pageContext?.pageKey]);

  // Reload tools when page context or node type changes
  useEffect(() => {
    if (!pageContext?.pageKey) return;
    const nodeType = pageContext.data?.nodeType as string | undefined;
    const tools = getTools(pageContext.pageKey, nodeType);
    setActiveTools(tools);
  }, [pageContext?.pageKey, pageContext?.data?.nodeType]);

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

      // Execute tool calls
      if (toolCalls.length > 0) {
        const toolResults: Message[] = [];
        for (const tc of toolCalls) {
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
        // Add tool results and then the assistant's text response
        const finalMessages = [...updatedMessages, ...toolResults];
        if (assistantContent) {
          finalMessages.push({ id: crypto.randomUUID(), role: 'assistant', content: assistantContent, timestamp: Date.now() });
        }
        setMessages(finalMessages);
      } else if (assistantContent) {
        const finalMessages = [...updatedMessages, { id: crypto.randomUUID(), role: 'assistant', content: assistantContent, timestamp: Date.now() }];
        setMessages(finalMessages);
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
      open, setOpen, toggle,
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
