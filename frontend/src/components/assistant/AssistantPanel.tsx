import { useState, useRef, useEffect } from 'react';
import { useAssistant } from './AssistantContext';
import { Send, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col'],
  attributes: {
    ...defaultSchema.attributes,
    th: ['align', 'scope', 'colspan', 'rowspan'],
    td: ['align', 'colspan', 'rowspan'],
    table: ['class'],
  },
};

export function AssistantPanel() {
  const {
    open, messages, streaming, streamingContent, error,
    sendMessage, clearConversation, defaultEndpointId, pageContext,
  } = useAssistant();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <div className="fixed bottom-24 right-6 z-50 w-[480px] max-h-[720px] bg-white rounded-xl shadow-2xl border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-xl shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">Co-Pilot</span>
          {pageContext && (
            <span className="text-[9px] text-gray-400 ml-1 max-w-[120px] truncate" title={pageContext.description}>
              · {pageContext.description}
            </span>
          )}
          {!defaultEndpointId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">No endpoint</span>
          )}
        </div>
        <button onClick={clearConversation} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Clear conversation">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[520px]">
        {!hasMessages && (
          <div className="text-center text-gray-400 text-xs py-8">
            Ask me anything about building flows, managing settings, or writing code.
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'bg-gray-900 text-white'
                : m.role === 'tool'
                  ? 'bg-gray-100 text-gray-600 text-[11px] font-mono'
                  : 'bg-gray-100 text-gray-900'
            }`}>
              {m.role === 'tool' ? (
                <div>
                  <span className="font-semibold">🔧 {m.name}: </span>
                  {m.content.slice(0, 200)}{m.content.length > 200 ? '...' : ''}
                </div>
              ) : m.role === 'user' ? (
                m.content
              ) : (
                <div className="prose prose-sm max-w-none prose-code:bg-gray-200 prose-code:px-1 prose-code:rounded">
                  <ReactMarkdown rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming content */}
        {streaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-900">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}>{streamingContent}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {streaming && !streamingContent && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 bg-gray-100">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded p-2">
            <AlertTriangle className="w-3 h-3 shrink-0" /> {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-3 shrink-0 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          placeholder="Ask anything..."
          rows={1}
          className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
          disabled={streaming}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 shrink-0 self-end"
        >
          {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
