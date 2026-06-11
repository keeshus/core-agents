import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Loader2, ChevronRight,
  ChevronDown, ChevronUp, AlertTriangle, Zap, Eye, EyeOff
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Execution {
  id: string;
  flow_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: any;
  output: any;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ExecutionStep {
  id: string;
  execution_id: string;
  node_id: string;
  node_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: any;
  output: any;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

type ViewMode = 'list' | 'detail';

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  'llm-agent': 'LLM Agent',
  'mcp-tool': 'MCP Tool',
  retriever: 'Retriever',
  branch: 'Condition',
  code: 'Code',
  output: 'Output',
};

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Failed' },
  running: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Running' },
  pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'Pending' },
  cancelled: { icon: XCircle, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', label: 'Cancelled' },
};

export default function ExecutionHistoryPage() {
  const router = useRouter();
  const { id: flowId } = router.query;
  const [view, setView] = useState<ViewMode>('list');
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!flowId) return;
    fetch(`${API_URL}/flows/${flowId}/executions`)
      .then(r => r.json())
      .then(setExecutions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [flowId]);

  const viewDetails = async (executionId: string) => {
    const exec = executions.find(e => e.id === executionId);
    if (!exec) return;
    setSelectedExecution(exec);
    setView('detail');
    setExpandedSteps({});
    if (flowId) {
      const res = await fetch(`${API_URL}/flows/${flowId}/executions/${executionId}`);
      const data = await res.json();
      if (data.steps) setSteps(data.steps);
    }
  };

  const goBack = () => {
    setView('list');
    setSelectedExecution(null);
    setSteps([]);
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const formatTime = (t: string | null) => {
    if (!t) return '—';
    return new Date(t).toLocaleTimeString();
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return null;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '...' : s;

  const renderContent = (data: any) => {
    if (!data) return <span className="text-gray-300 italic">empty</span>;
    if (typeof data === 'string') {
      return <span className="text-gray-700 whitespace-pre-wrap">{truncate(data, 500)}</span>;
    }
    try {
      const s = JSON.stringify(data, null, 2);
      return <pre className="text-xs whitespace-pre-wrap break-all text-gray-700 max-h-64 overflow-y-auto">{s}</pre>;
    } catch {
      return <span className="text-gray-500">{String(data)}</span>;
    }
  };

  // ── List View ───────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center gap-3 mb-6">
            <Link href={`/flows/${flowId}/edit`} className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">Execution History</h1>
              <p className="text-sm text-gray-500 mt-1">Debug trace of every flow run</p>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : executions.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border">
              <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 mb-1">No executions yet</p>
              <p className="text-xs text-gray-400">Run this flow to see debug traces here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {executions.map(exec => {
                const cfg = statusConfig[exec.status] || statusConfig.pending;
                const StatusIcon = cfg.icon;
                const dur = formatDuration(exec.started_at, exec.completed_at);
                return (
                  <button
                    key={exec.id}
                    onClick={() => viewDetails(exec.id)}
                    className="w-full bg-white rounded-lg border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow text-left"
                  >
                    <div className={`p-2 rounded-full ${cfg.bg}`}>
                      <StatusIcon className={`w-5 h-5 ${cfg.color} ${exec.status === 'running' ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize font-medium ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {dur && <span className="text-xs text-gray-400">{dur}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatTime(exec.created_at)}
                      </p>
                      {exec.error && (
                        <p className="text-xs text-red-500 mt-1 truncate font-mono">{truncate(exec.error, 80)}</p>
                      )}
                    </div>
                    <div className="hidden sm:block text-[10px] text-gray-400 max-w-[150px] truncate font-mono">
                      ID: {truncate(exec.id, 8)}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Detail View (Debug Trace) ─────────────────────────────────

  const cfg = selectedExecution ? statusConfig[selectedExecution.status] || statusConfig.pending : statusConfig.pending;
  const StatusIcon = cfg.icon;
  const totalDur = selectedExecution ? formatDuration(selectedExecution.started_at, selectedExecution.completed_at) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={goBack} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Debug Trace</h1>
              {selectedExecution && (
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
              )}
            </div>
            {selectedExecution && (
              <p className="text-sm text-gray-500 mt-1">
                {formatTime(selectedExecution.created_at)}
                {totalDur && <span className="ml-2 text-gray-400">· Duration: {totalDur}</span>}
              </p>
            )}
          </div>
          {flowId && (
            <Link
              href={`/flows/${flowId}/edit`}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Open Flow Editor
            </Link>
          )}
        </div>

        {selectedExecution && (
          <>
            {/* Error Banner */}
            {selectedExecution.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-red-700 mb-1">Execution Failed</h3>
                  <p className="text-xs text-red-600 font-mono break-all">{selectedExecution.error}</p>
                </div>
              </div>
            )}

            {/* Step trace — vertical timeline */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Step Trace ({steps.length} steps)
              </h2>

              {steps.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border">
                  <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No step data recorded</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />

                  <div className="space-y-2">
                    {steps.map((step, i) => {
                      const stepCfg = statusConfig[step.status] || statusConfig.pending;
                      const StepIcon = stepCfg.icon;
                      const stepDur = formatDuration(step.started_at, step.completed_at);
                      const nodeLabel = NODE_LABELS[step.node_type] || step.node_type;
                      const isExpanded = expandedSteps[step.id] || false;
                      const hasDetails = step.input || step.output || step.error;
                      const isLLM = step.node_type === 'llm-agent';

                      return (
                        <div key={step.id} className="relative pl-12">
                          {/* Timeline dot */}
                          <div className={`absolute left-3.5 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white ${stepCfg.bg} ${step.status === 'failed' ? 'ring-2 ring-red-200' : ''}`} />

                          {/* Step card */}
                          <div className={`bg-white rounded-lg border ${step.status === 'failed' ? 'border-red-200 bg-red-50/30' : ''}`}>
                            {/* Header */}
                            <button
                              onClick={() => hasDetails && toggleStep(step.id)}
                              className="w-full p-3 flex items-center gap-3 text-left hover:bg-gray-50/50 transition-colors rounded-t-lg"
                            >
                              <StepIcon className={`w-4 h-4 ${stepCfg.color} shrink-0 ${step.status === 'running' ? 'animate-spin' : ''}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-gray-900">{nodeLabel}</span>
                                  <span className="text-[10px] text-gray-400 font-mono">{truncate(step.node_id, 12)}</span>
                                  {isLLM && step.status === 'completed' && step.output && (
                                    <span className="text-[10px] text-gray-500">
                                      {(step.output as any).model || 'LLM'}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`text-[10px] px-1 rounded ${stepCfg.bg} ${stepCfg.color} capitalize`}>
                                    {stepCfg.label}
                                  </span>
                                  {stepDur && <span className="text-[10px] text-gray-400">{stepDur}</span>}
                                  {step.started_at && (
                                    <span className="text-[10px] text-gray-400">{formatTime(step.started_at)}</span>
                                  )}
                                </div>
                              </div>
                              {hasDetails && (
                                isExpanded
                                  ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                                  : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                              )}
                            </button>

                            {/* Error inline */}
                            {step.error && (
                              <div className="px-3 pb-2 ml-9">
                                <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-700 font-mono break-all">
                                  <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                                  {step.error}
                                </div>
                              </div>
                            )}

                            {/* Expanded details */}
                            {isExpanded && hasDetails && (
                              <div className="border-t px-3 py-3 space-y-3">
                                {/* LLM agent: show prompt context */}
                                {isLLM && step.input && (
                                  <div>
                                    <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                      {typeof (step.input as any).systemPrompt === 'string' ? 'System Prompt' : 'LLM Input'}
                                    </h4>
                                    <div className="bg-gray-50 rounded p-2">
                                      {typeof (step.input as any).systemPrompt === 'string' ? (
                                        <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                                          {(step.input as any).systemPrompt}
                                        </pre>
                                      ) : (
                                        <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                                          {JSON.stringify(step.input, null, 2)}
                                        </pre>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Non-LLM input */}
                                {!isLLM && step.input && (
                                  <div>
                                    <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Input</h4>
                                    <div className="bg-gray-50 rounded p-2">
                                      {renderContent(step.input)}
                                    </div>
                                  </div>
                                )}

                                {/* Output */}
                                {step.output && (
                                  <div>
                                    <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                      {isLLM ? 'LLM Response' : 'Output'}
                                    </h4>
                                    <div className="bg-green-50/50 rounded p-2 border border-green-100">
                                      {isLLM && typeof (step.output as any).content === 'string' ? (
                                        <div className="text-xs text-gray-800 whitespace-pre-wrap break-all">
                                          {(step.output as any).content}
                                        </div>
                                      ) : (
                                        <pre className={`text-xs whitespace-pre-wrap break-all max-h-48 overflow-y-auto ${
                                          step.status === 'failed' ? 'text-red-700' : 'text-gray-700'
                                        }`}>
                                          {JSON.stringify(step.output, null, 2)}
                                        </pre>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Timing detail */}
                                <div className="flex gap-4 text-[10px] text-gray-400">
                                  <span>Started: {formatTime(step.started_at)}</span>
                                  <span>Completed: {formatTime(step.completed_at)}</span>
                                  {stepDur && <span>Duration: {stepDur}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Final output */}
            {selectedExecution.output && (
              <div className="mt-6 bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Final Output</h3>
                <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all">
                  {JSON.stringify(selectedExecution.output, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
