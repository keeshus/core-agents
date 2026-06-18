import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Clock, Loader2, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, Zap, StopCircle, Bug } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/lib/auth-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Execution {
  id: string;
  flow_id: string;
  status: string;
  input: any;
  output: any;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger', 'llm-agent': 'LLM Agent', 'mcp-tool': 'MCP Tool',
  retriever: 'Retriever', branch: 'Condition', code: 'Code', output: 'Output',
};

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Failed' },
  running: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Running' },
  pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'Pending' },
  cancelled: { icon: XCircle, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', label: 'Cancelled' },
  awaiting_approval: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'Awaiting Approval' },
};

const fmtTime = (t: string | null) => t ? new Date(t).toLocaleTimeString() : '—';
const dur = (s: string | null, e: string | null) => {
  if (!s || !e) return null;
  const ms = new Date(e).getTime() - new Date(s).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};
const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n) + '...' : s;

export default function ExecutionHistoryPage() {
  const router = useRouter();
  const { id: flowId } = router.query;
  const { user } = useAuth();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const backHref = user && !can('flow:create') ? '/approvals' : '/';
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selected, setSelected] = useState<Execution | null>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState<string | null>(null);

  const cancel = async (execId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelling(execId);
    try {
      await fetch(`${API_URL}/executions/${execId}/cancel`, { method: 'POST' });
      const res = await fetch(`${API_URL}/flows/${flowId}/executions`);
      setExecutions(await res.json());
    } catch { /* */ } finally { setCancelling(null); }
  };

  useEffect(() => {
    if (!flowId) return;
    fetch(`${API_URL}/flows/${flowId}/executions`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setExecutions(Array.isArray(data) ? data : []))
      .catch(() => setExecutions([]))
      .finally(() => setLoading(false));
  }, [flowId]);

  const viewDetails = async (execId: string) => {
    const exec = executions.find(e => e.id === execId);
    if (!exec) return;
    setSelected(exec);
    setView('detail');
    setExpanded({});
    const res = await fetch(`${API_URL}/flows/${flowId}/executions/${execId}`);
    const data = await res.json();
    if (data.steps) setSteps(data.steps);
  };

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  if (view === 'list') return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href={backHref} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="flex-1"><h1 className="text-2xl font-bold text-gray-900">Execution History</h1></div>
        </div>
        {loading ? <p className="text-gray-500 text-sm">Loading...</p> : executions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">No executions yet</p>
          </div>
        ) : (
          <div className="space-y-2">{executions.map(exec => {
            const cfg = statusConfig[exec.status] || statusConfig.pending;
            const Icon = cfg.icon;
            const d = dur(exec.started_at, exec.completed_at);
            const isDebug = exec.input?._debug;
            return (
              <div key={exec.id} onClick={() => viewDetails(exec.id)} className="w-full bg-white rounded-lg border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow cursor-pointer">
                <div className={`p-2 rounded-full ${cfg.bg}`}><Icon className={`w-5 h-5 ${cfg.color} ${exec.status === 'running' ? 'animate-spin' : ''}`} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                    {isDebug && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium flex items-center gap-1"><Bug className="w-3 h-3" /> Debug</span>}
                    {d && <span className="text-xs text-gray-400">{d}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{fmtTime(exec.created_at)}</p>
                  {exec.error && <p className="text-xs text-red-500 mt-1 truncate font-mono">{trunc(exec.error, 80)}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {exec.status === 'awaiting_approval' && (
                    <>
                      {exec.output?._hitlPrompt && (
                        <div className="w-full mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs max-h-48 overflow-y-auto prose prose-sm max-w-none">
                          <ReactMarkdown>{exec.output._hitlPrompt}</ReactMarkdown>
                        </div>
                      )}
                      <div className="w-full">
                        {exec.output?._hitlAllowFeedback !== false && (
                          <textarea
                            value={feedback[exec.id] || ''}
                            onChange={(e) => setFeedback(prev => ({ ...prev, [exec.id]: e.target.value }))}
                            placeholder="Optional feedback..."
                            rows={2}
                            className="w-full mb-2 text-xs border border-gray-300 rounded p-2 resize-none"
                          />
                        )}
                        <div className="flex items-center gap-2 justify-end">
                        {(exec.output?._hitlButtons || [{ label: 'Approve', value: 'approved' }]).map((btn: any) => (
                          <button key={btn.value} onClick={async (e) => {
                            e.stopPropagation();
                            const fb = feedback[exec.id] || '';
                            if (btn.value === 'rejected') {
                              await fetch(`${API_URL}/executions/${exec.id}/reject`, { method: 'POST' });
                            } else {
                              await fetch(`${API_URL}/executions/${exec.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: btn.value, feedback: fb, hitlNodeId: exec.output?._hitlNodeId || undefined }) });
                            }
                            window.location.reload();
                          }} className={`flex items-center gap-1 px-2 py-1 rounded text-xs shrink-0 ${
                            btn.value === 'rejected' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                            btn.value === 'approved' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                            'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          }`}><CheckCircle className="w-3 h-3" />{btn.label}</button>
                        ))}
                        </div>
                      </div>
                    </>
                  )}
                  {exec.status === 'running' && (
                    <button onClick={(e) => cancel(exec.id, e)} disabled={cancelling === exec.id} className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 disabled:opacity-50 shrink-0"><StopCircle className="w-3 h-3" />{cancelling === exec.id ? '...' : 'Stop'}</button>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </div>
              </div>
            );
          })}</div>
        )}
      </div>
    </div>
  );

  // Detail view
  const cfg = selected ? statusConfig[selected.status] || statusConfig.pending : statusConfig.pending;
  const Icon = cfg.icon;
  const total = selected ? dur(selected.started_at, selected.completed_at) : null;
  const isDebug = selected?.input?._debug;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setView('list'); setSelected(null); setSteps([]); }} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-4 h-4" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{isDebug ? 'Debug Trace' : 'Execution Details'}</h1>
              {isDebug && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium flex items-center gap-1"><Bug className="w-3 h-3" /> Debug</span>}
              {selected && <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>}
            </div>
            {selected && <p className="text-sm text-gray-500 mt-1">{fmtTime(selected.created_at)}{total && <span className="ml-2 text-gray-400">· {total}</span>}</p>}
          </div>
          {flowId && <Link href={`/flows/${flowId}/edit`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Open Editor</Link>}
        </div>

        {selected?.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div><h3 className="text-sm font-semibold text-red-700 mb-1">Execution Failed</h3><p className="text-xs text-red-600 font-mono break-all">{selected.error}</p></div>
          </div>
        )}

        {steps.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border"><Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400">No step data recorded</p></div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Step Trace ({steps.length} steps)</h2>
            <div className="space-y-2">{steps.map((step: any) => {
              const sc = statusConfig[step.status] || statusConfig.pending;
              const SIcon = sc.icon;
              const sd = dur(step.started_at, step.completed_at);
              const label = NODE_LABELS[step.node_type] || step.node_type;
              const open = expanded[step.id] || false;
              const has = step.input || step.output || step.error;
              const isLLM = step.node_type === 'llm-agent';
              return (
                <div key={step.id} className="bg-white rounded-lg border overflow-hidden">
                  <button onClick={() => toggle(step.id)} className="w-full p-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
                    {step.status === 'running' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
                    {step.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                    {step.status === 'failed' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                    {step.status === 'pending' && <Clock className="w-4 h-4 text-yellow-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{label}</span>
                        {step.node_id && <span className="text-[10px] text-gray-400 font-mono">{trunc(step.node_id, 12)}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-1 rounded capitalize ${sc.bg} ${sc.color}`}>{sc.label}</span>
                        {sd && <span className="text-[10px] text-gray-400">{sd}</span>}
                        {step.started_at && <span className="text-[10px] text-gray-400">{fmtTime(step.started_at)}</span>}
                      </div>
                    </div>
                    {step.error && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                    {has && (open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />)}
                  </button>
                  {open && has && (
                    <div className="border-t bg-gray-50/50 p-4 space-y-3">
                      {step.error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2"><AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" /><span className="text-xs text-red-700 font-mono break-all">{step.error}</span></div>}
                      {isLLM && step.input?.systemPrompt && <div><h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">System Prompt</h4><pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">{step.input.systemPrompt}</pre></div>}
                      {step.input && !isLLM && <div><h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Input</h4><pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{JSON.stringify(step.input, null, 2)}</pre></div>}
                      {step.output && <div><h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{isLLM ? 'LLM Response' : 'Output'}</h4>{isLLM && typeof step.output.content === 'string' ? <div className="text-xs text-gray-800 whitespace-pre-wrap break-all bg-green-50/50 rounded p-2 border border-green-100">{step.output.content}</div> : <pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{JSON.stringify(step.output, null, 2)}</pre>}</div>}
                    </div>
                  )}
                </div>
              );
            })}</div>
            {selected?.output && <div className="mt-6 bg-white rounded-lg border p-4"><h3 className="text-sm font-semibold text-gray-900 mb-2">Final Output</h3><pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all">{JSON.stringify(selected.output, null, 2)}</pre></div>}
          </div>
        )}
      </div>
    </div>
  );
}
