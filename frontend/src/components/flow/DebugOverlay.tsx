import { useEffect, useState, useRef, useCallback } from 'react';
import {
  X, Play, Loader2, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp, AlertTriangle, Bot, Wrench, GitBranch, Code, ArrowRight
} from 'lucide-react';

interface DebugOverlayProps {
  flowId: string;
  onClose: () => void;
}

interface StepEvent {
  type: string;
  executionId?: string;
  nodeId?: string;
  data: Record<string, any>;
  timestamp: string;
}

interface StepInfo {
  nodeId: string;
  nodeType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: any;
  output: any;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  tokens: string[];
}

const NODE_ICONS: Record<string, any> = {
  trigger: ArrowRight,
  'llm-agent': Bot,
  'mcp-tool': Wrench,
  branch: GitBranch,
  code: Code,
  output: CheckCircle,
  retriever: Clock,
};

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  'llm-agent': 'LLM Agent',
  'mcp-tool': 'MCP Tool',
  retriever: 'Retriever',
  branch: 'Condition',
  code: 'Code',
  output: 'Output',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export function DebugOverlay({ flowId, onClose }: DebugOverlayProps) {
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [finalOutput, setFinalOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const run = useCallback(async () => {
    setSteps([]);
    setFinalOutput(null);
    setError(null);
    setStatus('running');

    try {
      const res = await fetch(`${API_URL}/flows/${flowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { message: 'Hello! This is a debug run.' } }),
      });
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
          if (!line.startsWith('data: ')) continue;
          let event: StepEvent;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (!event) continue;

          const d = event.data || {};
          const nodeId = event.nodeId || d.nodeId || '';

          if (event.type === 'step.started') {
            setSteps(prev => [...prev, {
              nodeId,
              nodeType: d.nodeType || '',
              status: 'running',
              input: d.input,
              output: null,
              error: null,
              startedAt: event.timestamp,
              completedAt: null,
              tokens: [],
            }]);
          } else if (event.type === 'stream.token') {
            setSteps(prev => prev.map(s =>
              s.nodeId === nodeId && s.status === 'running'
                ? { ...s, tokens: [...s.tokens, d.token || ''] }
                : s
            ));
          } else if (event.type === 'step.completed') {
            setSteps(prev => prev.map(s =>
              s.nodeId === nodeId ? { ...s, status: 'completed', output: d.output, completedAt: event.timestamp } : s
            ));
          } else if (event.type === 'step.failed') {
            setSteps(prev => prev.map(s =>
              s.nodeId === nodeId ? { ...s, status: 'failed', error: d.error || null, completedAt: event.timestamp } : s
            ));
          } else if (event.type === 'execution.completed') {
            setFinalOutput(d.output);
            setStatus('completed');
          } else if (event.type === 'execution.failed') {
            setError(d.error || 'Execution failed');
            setStatus('failed');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Execution error');
      setStatus('failed');
    }
  }, [flowId]);

  const formatTime = (t: string) => new Date(t).toLocaleTimeString();

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="h-12 border-b flex items-center justify-between px-4 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Debug Run</h2>
          {status === 'running' && (
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <Loader2 className="w-3 h-3 animate-spin" /> Running...
            </span>
          )}
          {status === 'completed' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="w-3 h-3" /> Completed
            </span>
          )}
          {status === 'failed' && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <XCircle className="w-3 h-3" /> Failed
            </span>
          )}
          {status === 'idle' && (
            <span className="text-xs text-gray-400">Ready to run</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={run}
            disabled={status === 'running'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {status === 'idle' ? 'Start Debug Run' : status === 'running' ? 'Running' : 'Re-run'}
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">
        {/* Step trace panel */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {status === 'idle' && steps.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Ready to debug</p>
                <p className="text-sm text-gray-400 mt-1">Click &quot;Start Debug Run&quot; to trace your flow step by step</p>
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div className="max-w-3xl mx-auto space-y-1.5">
              {steps.map((step, i) => {
                const Icon = NODE_ICONS[step.nodeType] || Clock;
                const isExpanded = expanded[step.nodeId + i] || false;
                const isLLM = step.nodeType === 'llm-agent';
                const hasSystemPrompt = step.input?.systemPrompt;
                const hasTokens = step.tokens.length > 0;
                const stepLabel = NODE_LABELS[step.nodeType] || step.nodeType;

                return (
                  <div key={step.nodeId + i} className="bg-white rounded-lg border overflow-hidden">
                    {/* Step header */}
                    <button
                      onClick={() => toggle(step.nodeId + i)}
                      className="w-full p-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      {/* Status icon */}
                      {step.status === 'running' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
                      {step.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                      {step.status === 'failed' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                      {step.status === 'pending' && <Clock className="w-4 h-4 text-yellow-500 shrink-0" />}

                      <div className="flex items-center gap-2 shrink-0 w-4">
                        <Icon className="w-4 h-4 text-gray-400" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{stepLabel}</span>
                          {isLLM && step.input?.model && (
                            <span className="text-[10px] text-gray-400 font-mono">{step.input.model}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] capitalize ${
                            step.status === 'completed' ? 'text-green-600' :
                            step.status === 'failed' ? 'text-red-600' :
                            step.status === 'running' ? 'text-blue-600' : 'text-gray-400'
                          }`}>
                            {step.status}
                          </span>
                          {step.completedAt && (
                            <span className="text-[10px] text-gray-400">
                              {formatTime(step.startedAt)} → {formatTime(step.completedAt)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Streaming token preview */}
                      {isLLM && step.status === 'running' && hasTokens && (
                        <div className="hidden sm:block text-xs text-gray-500 italic truncate max-w-[200px]">
                          {step.tokens.join('').slice(-60)}
                        </div>
                      )}

                      {/* Completed LLM: short output preview */}
                      {isLLM && step.status === 'completed' && step.output?.content && (
                        <div className="hidden sm:block text-xs text-gray-500 truncate max-w-[200px]">
                          {String(step.output.content).slice(0, 60)}
                        </div>
                      )}

                      {/* Error indicator */}
                      {step.error && (
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      )}

                      {(step.input || step.output || hasTokens || hasSystemPrompt) && (
                        isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t bg-gray-50/50 p-4 space-y-3">
                        {/* System prompt */}
                        {hasSystemPrompt && (
                          <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">System Prompt</h4>
                            <pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                              {step.input.systemPrompt}
                            </pre>
                          </div>
                        )}

                        {/* Branch condition */}
                        {step.nodeType === 'branch' && step.input?.condition && (
                          <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Condition</h4>
                            <code className="text-xs bg-white border rounded p-2 block font-mono">{step.input.condition}</code>
                          </div>
                        )}

                        {/* Input */}
                        {step.input && !isLLM && (
                          <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Input</h4>
                            <pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                              {JSON.stringify(step.input, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Token stream for LLM */}
                        {isLLM && hasTokens && (
                          <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                              {step.status === 'running' ? 'Streaming Output' : 'Full Response'}
                            </h4>
                            <div className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto text-gray-800">
                              {step.tokens.join('')}
                              {step.status === 'running' && <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />}
                            </div>
                          </div>
                        )}

                        {/* Structured output */}
                        {step.output && !isLLM && (
                          <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Output</h4>
                            <pre className={`text-xs border rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto ${
                              step.status === 'failed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white text-gray-700'
                            }`}>
                              {JSON.stringify(step.output, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Error */}
                        {step.error && (
                          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2">
                            <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                            <span className="text-xs text-red-700 font-mono break-all">{step.error}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Final output */}
              {finalOutput && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-green-800 mb-2">Final Output</h3>
                  <pre className="text-xs whitespace-pre-wrap break-all text-green-900 max-h-48 overflow-y-auto">
                    {JSON.stringify(finalOutput, null, 2)}
                  </pre>
                </div>
              )}

              {/* Error */}
              {error && !steps.some(s => s.error) && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-red-700 mb-1">Execution Failed</h3>
                    <p className="text-xs text-red-600 font-mono break-all">{error}</p>
                  </div>
                </div>
              )}

              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
