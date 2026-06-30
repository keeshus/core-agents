import { useEffect, useState, useRef, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SelectField } from '@/components/ui/SelectField';
import { StepCard } from '@/components/flow/StepCard';

interface DebugOverlayProps {
  flowId: string;
  onClose: () => void;
  nodes?: any[];
  edges?: any[];
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
  nodeLabel?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: any;
  output: any;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  tokens: string[];
  iteration?: number;
  children?: Array<{ nodeId: string; type: string; output?: any; error?: string; status: string }>;
}

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}



const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const TRIGGER_CONFIG: Record<string, { label: string; icon: string; description: string }> = {
  manual: { label: 'Manual', icon: 'terminal', description: 'Send a message to trigger the flow' },
  chat: { label: 'Chat', icon: 'sms', description: 'Send a chat message with optional history' },
  webhook: { label: 'Webhook', icon: 'webhook', description: 'Provide a JSON payload as the webhook body' },
  schedule: { label: 'Schedule', icon: 'calendar_today', description: 'Trigger the flow with a message (simulates scheduled run)' },
};

export function DebugOverlay({ flowId, onClose, nodes: canvasNodes, edges: canvasEdges }: DebugOverlayProps) {
  const [flow, setFlow] = useState<any>(null);
  const [loadingFlow, setLoadingFlow] = useState(true);
  const [triggerType, setTriggerType] = useState<string>('manual');
  const [chatMessage, setChatMessage] = useState('Hello! This is a debug run.');
  const [chatHistory, setChatHistory] = useState<HistoryEntry[]>([]);
  const [manualMessage, setManualMessage] = useState('');
  const [webhookPayload, setWebhookPayload] = useState('{\n  "event": "test",\n  "data": {}\n}');
  const [webhookPayloadError, setWebhookPayloadError] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [finalOutput, setFinalOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hitlPause, setHitlPause] = useState<{ executionId: string; prompt: string; buttons: { label: string; value: string; icon?: string }[]; nodeId: string; allowFeedback?: boolean } | null>(null);
  const [hitlFeedback, setHitlFeedback] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Use canvas nodes if provided, otherwise fetch from API
    const resolveNodes = async () => {
      const nodes = canvasNodes || await fetch(`${API_URL}/flows/${flowId}`).then(res => res.json()).then(f => f.nodes || []).catch(() => []);
      setFlow({ nodes });
      const trigger = nodes.find((n: any) => n.type === 'trigger' || n.data?.type === 'trigger');
      if (trigger) {
        const tt = trigger.data?.config?.triggerType || 'manual';
        setTriggerType(tt);
        if (tt === 'webhook' && trigger.data?.config?.inputSchema) {
          try {
            const schema = JSON.parse(trigger.data.config.inputSchema);
            setWebhookPayload(JSON.stringify(schema, null, 2));
          } catch {}
        }
      }
      setLoadingFlow(false);
    };
    resolveNodes();
  }, [flowId, canvasNodes]);

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus('failed');
    setError('Cancelled by user');
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const buildInput = useCallback(() => {
    if (triggerType === 'chat') {
      return { chat_input: { message: chatMessage, history: chatHistory }, message: chatMessage, history: chatHistory };
    }
    if (triggerType === 'webhook') {
      try { return JSON.parse(webhookPayload); } catch { return { payload: webhookPayload }; }
    }
    return { message: manualMessage };
  }, [triggerType, chatMessage, chatHistory, manualMessage, webhookPayload]);

  const run = useCallback(async () => {
    setSteps([]);
    setFinalOutput(null);
    setError(null);
    setHitlPause(null);
    setHitlFeedback('');
    setStatus('running');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const input = buildInput();
      const body: any = { input: { _debug: true, ...input } };
      if (canvasNodes) body.nodes = canvasNodes;
      if (canvasEdges) body.edges = canvasEdges;
      const res = await fetch(`${API_URL}/flows/${flowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (controller.signal.aborted) { reader.cancel(); break; }
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
              nodeLabel: d.nodeLabel || '',
              status: 'running',
              input: d.input,
              output: null,
              error: null,
              startedAt: event.timestamp,
              completedAt: null,
              tokens: [],
              iteration: d.iteration ?? 0,
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
          } else if (event.type === 'log' && d.subNodeId) {
            setSteps(prev => prev.map(s => {
              if (s.nodeId !== nodeId || s.nodeType !== 'parallel') return s;
              const existing = s.children || [];
              const child = { nodeId: d.subNodeId, type: d.subNodeType, output: d.output, error: d.error, status: d.status };
              return { ...s, children: [...existing.filter(c => c.nodeId !== d.subNodeId), child] };
            }));
          } else if (event.type === 'execution.completed') {
            // Extract the output node's value from the accumulated result
            let outputValue = d.output;
            if (canvasNodes && d.output && typeof d.output === 'object') {
              for (const n of canvasNodes) {
                if (n.data?.type === 'output' && d.output[n.id] !== undefined) {
                  outputValue = d.output[n.id];
                  break;
                }
              }
            }
            setFinalOutput(outputValue);
            setStatus('completed');
            // Fallback: merge engine steps + canvas nodes to ensure all nodes appear
            setSteps(prev => {
              const existingIds = new Set(prev.map(s => s.nodeId));
              const toAdd: StepInfo[] = [];
              // Add any missing steps from engine result
              if (d.steps) {
                for (const s of d.steps) {
                  const nid = s.nodeId || s.node_id;
                  if (nid && !existingIds.has(nid)) {
                    existingIds.add(nid);
                    toAdd.push({
                      nodeId: nid,
                      nodeType: s.nodeType || s.node_type || 'unknown',
                      nodeLabel: s.nodeLabel || s.node_label || '',
                      status: s.status || 'completed',
                      input: s.input,
                      output: s.output,
                      error: s.error || null,
                      startedAt: s.startedAt || s.started_at,
                      completedAt: s.completedAt || s.completed_at,
                      tokens: s.tokens || [],
                      iteration: s.iteration ?? 0,
                      children: s.children,
                    });
                  }
                }
              }
              // Add missing output nodes from canvas definition
              if (canvasNodes) {
                for (const n of canvasNodes) {
                  if (n.data?.type === 'output' && !existingIds.has(n.id)) {
                    existingIds.add(n.id);
                    toAdd.push({
                      nodeId: n.id,
                      nodeType: 'output',
                      nodeLabel: n.data?.label || 'Output',
                      status: 'completed',
                      input: {},
                      output: outputValue,
                      error: null,
                      startedAt: '',
                      completedAt: null,
                      tokens: [],
                      iteration: 0,
                      children: undefined,
                    });
                  }
                }
              }
              return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
            });
            if (d.steps && d.steps.length > 0) {
              setSteps(prev => {
                const existingIds = new Set(prev.map(s => s.nodeId));
                const newSteps = d.steps
                  .filter((s: any) => !existingIds.has(s.nodeId || s.node_id))
                  .map((s: any) => ({
                    nodeId: s.nodeId || s.node_id,
                    nodeType: s.nodeType || s.node_type,
                    nodeLabel: s.nodeLabel || s.node_label,
                    status: s.status,
                    input: s.input,
                    output: s.output,
                    error: s.error || null,
                    startedAt: s.startedAt || s.started_at,
                    completedAt: s.completedAt || s.completed_at,
                    tokens: s.tokens || [],
                    iteration: s.iteration ?? 0,
                    children: s.children,
                  }));
                return newSteps.length > 0 ? [...prev, ...newSteps] : prev;
              });
            }
          } else if (event.type === 'execution.paused') {
            setHitlPause({
              executionId: event.executionId || '',
              prompt: d.prompt || 'Waiting for approval',
              buttons: d.buttons || [{ label: 'Approve', value: 'approved', icon: 'check_circle' }, { label: 'Reject', value: 'rejected', icon: 'cancel' }],
              nodeId: d.nodeId || '',
              allowFeedback: d.allowFeedback !== false,
            });
            setHitlFeedback('');
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
  }, [flowId, buildInput]);

  const handleHitlApprove = useCallback(async (decision: string) => {
    if (!hitlPause) return;
    setHitlPause(null);
    setStatus('running');
    try {
      const res = await fetch(`${API_URL}/executions/${hitlPause.executionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, feedback: hitlFeedback, hitlNodeId: hitlPause.nodeId }),
      });
      const result = await res.json();
      if (result.status === 'completed') {
        const detail = await fetch(`${API_URL}/flows/${flowId}/executions/${hitlPause.executionId}`, { credentials: 'include' });
        const data = await detail.json();
        if (data.steps) {
          const mappedSteps: StepInfo[] = data.steps.map((s: any) => ({
            nodeId: s.node_id,
            nodeType: s.node_type,
            nodeLabel: s.node_label,
            status: s.status,
            input: s.input,
            output: s.output,
            error: s.error || null,
            startedAt: s.started_at,
            completedAt: s.completed_at,
            tokens: s.tokens || [],
            iteration: s.iteration ?? 0,
            children: s.children,
          }));
          setSteps(mappedSteps);
        }
        setFinalOutput(result.output || data.output);
        setStatus('completed');
      } else if (result.status === 'failed') {
        setError(result.error || 'Execution failed');
        setStatus('failed');
      } else {
        setStatus('running');
      }
    } catch (err: any) {
      setError(err.message || 'Approval failed');
      setStatus('failed');
    }
  }, [hitlPause, flowId]);

  const handleHitlReject = useCallback(async () => {
    if (!hitlPause) return;
    setHitlPause(null);
    setHitlFeedback('');
    try {
      await fetch(`${API_URL}/executions/${hitlPause.executionId}/reject`, {
        method: 'POST',
        credentials: 'include',
      });
      setStatus('failed');
      setError('Execution rejected by user');
    } catch (err: any) {
      setError(err.message || 'Rejection failed');
      setStatus('failed');
    }
  }, [hitlPause]);

  const isValidJson = useCallback((str: string) => {
    try { JSON.parse(str); return true; } catch { return false; }
  }, []);

  const validateWebhookPayload = useCallback((value: string) => {
    if (!value.trim()) { setWebhookPayloadError(null); return; }
    try { JSON.parse(value); setWebhookPayloadError(null); } catch (e: any) { setWebhookPayloadError(e.message); }
  }, []);

  const handleWebhookChange = useCallback((value: string) => {
    setWebhookPayload(value);
    validateWebhookPayload(value);
  }, [validateWebhookPayload]);

  const addHistoryEntry = () => {
    setChatHistory(prev => [...prev, { role: 'user', content: '' }]);
  };

  const updateHistoryEntry = (index: number, field: keyof HistoryEntry, value: string) => {
    setChatHistory(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const removeHistoryEntry = (index: number) => {
    setChatHistory(prev => prev.filter((_, i) => i !== index));
  };



  const triggerIconName = TRIGGER_CONFIG[triggerType]?.icon || 'terminal';

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col">
      {/* Header — clean minimal bar */}
      <div className="h-11 border-b flex items-center justify-between px-4 shrink-0 bg-surface">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-on-surface">Debug Run</h2>
          {!loadingFlow && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded">
              <Icon name={triggerIconName} className="text-xs" />
              {TRIGGER_CONFIG[triggerType]?.label || triggerType}
            </span>
          )}
          {status === 'running' && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Icon name="sync" className="text-xs animate-spin" /> Running...
            </span>
          )}
          {status === 'completed' && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Icon name="check_circle" className="text-xs" /> Completed
            </span>
          )}
          {status === 'failed' && (
            <span className="flex items-center gap-1 text-xs text-error">
              <Icon name="cancel" className="text-xs" /> Failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="flex items-center gap-1 p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors">
            <Icon name="close" className="text-base" /> Close
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Loading state */}
        {loadingFlow && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
                <Icon name="sync" className="text-3xl text-primary animate-spin mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">Loading flow...</p>
            </div>
          </div>
        )}

        {!loadingFlow && (
          <div className="max-w-4xl mx-auto py-6 px-6">
            {/* Re-run bar — always visible, the primary input */}
            <div className="bg-surface border rounded-xl p-4 mb-4 space-y-3">
              {triggerType === 'chat' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Message</label>
                    <textarea
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      placeholder="Enter the chat message..."
className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono resize-none bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      rows={2}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-on-surface-variant">History</label>
                      <button onClick={addHistoryEntry} className="flex items-center gap-1 text-xs text-primary hover:text-primary">
                        <Icon name="add" className="text-xs" /> Add entry
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {chatHistory.map((entry, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <SelectField
                            label="Role"
                            value={entry.role}
                            onChange={(v) => updateHistoryEntry(i, 'role', v)}
                            options={[
                              { value: 'user', label: 'user' },
                              { value: 'assistant', label: 'assistant' },
                            ]}
                          />
                          <input
                            type="text"
                            value={entry.content}
                            onChange={(e) => updateHistoryEntry(i, 'content', e.target.value)}
                            placeholder="Message content..."
                            className="flex-1 text-xs border border-outline rounded-lg px-2.5 py-1.5 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                          <button onClick={() => removeHistoryEntry(i)} className="flex items-center gap-1 p-1.5 text-error hover:text-error hover:bg-error-container rounded transition-colors">
                            <Icon name="delete" className="text-sm" /> Remove
                          </button>
                        </div>
                      ))}
                      {chatHistory.length === 0 && (
                        <p className="text-xs text-on-surface-variant italic">No history — the message above will be sent fresh</p>
                      )}
                    </div>
                  </div>
                </>
              )}
              {(triggerType === 'manual' || triggerType === 'schedule') && (
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Message</label>
                  <textarea
                    value={manualMessage}
                    onChange={(e) => setManualMessage(e.target.value)}
                    placeholder="Enter the message to send to the flow..."
                    className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono resize-none bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    rows={2}
                  />
                </div>
              )}
              {triggerType === 'webhook' && (
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Payload</label>
                  <textarea
                    value={webhookPayload}
                    onChange={(e) => handleWebhookChange(e.target.value)}
                    placeholder='{"event": "test", "data": {}}'
                    className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[120px]"
                    rows={5}
                  />
                  {webhookPayloadError && (
                    <p className="text-[11px] text-error mt-1 font-mono">Invalid JSON: {webhookPayloadError}</p>
                  )}
                </div>
              )}
              <button
                onClick={status === 'running' ? stop : run}
                disabled={status === 'running' ? false : (triggerType === 'webhook' && webhookPayloadError !== null)}
                className="m3-button text-sm w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                {status === 'running' ? <><Icon name="stop" className="text-base" /> Stop</> : <><Icon name="play_arrow" className="text-base" /> {status === 'idle' ? 'Start Debug Run' : 'Re-run'}</>}
              </button>
            </div>

            {/* Content area below the input form */}
            {status === 'idle' && steps.length === 0 && (
              <div className="text-center py-12">
                <Icon name="smart_toy" className="text-5xl text-outline-variant mx-auto mb-3" />
                <p className="text-on-surface-variant font-medium">Ready to debug</p>
                <p className="text-sm text-on-surface-variant mt-1">Fill in the input above and click &quot;Start Debug Run&quot;</p>
              </div>
            )}

            {steps.length === 0 && status === 'running' && (
              <div className="text-center py-12">
              <Icon name="sync" className="text-3xl text-primary animate-spin mx-auto mb-3" />
                <p className="text-on-surface-variant font-medium">Executing flow...</p>
              </div>
            )}

            {steps.length === 0 && !loadingFlow && status !== 'idle' && status !== 'running' && (
              <div className="bg-surface rounded-lg border p-8 text-center">
                {status === 'completed' ? (
                  <Icon name="check_circle" className="text-5xl text-success mx-auto mb-3" />
                ) : (
                  <Icon name="cancel" className="text-5xl text-error mx-auto mb-3" />
                )}
                <h3 className="text-lg font-semibold text-on-surface mb-1">
                  {status === 'completed' ? 'Execution Completed' : 'Execution Failed'}
                </h3>
                {error && <p className="text-sm text-error font-mono mt-2">{error}</p>}
                {finalOutput && (
                  <pre className="text-xs bg-surface-container p-3 rounded mt-4 text-left overflow-auto max-h-64">{typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2)}</pre>
                )}
                {!error && !finalOutput && <p className="text-sm text-on-surface-variant">No output data was returned.</p>}
              </div>
            )}

            {steps.length > 0 && (
              <div className="space-y-1.5">
                {(() => {
                  const groups: { iter: number; steps: StepInfo[] }[] = [];
                  for (const step of steps) {
                    const iter = step.iteration ?? 0;
                    let group = groups.find(g => g.iter === iter);
                    if (!group) { group = { iter, steps: [] }; groups.push(group); }
                    group.steps.push(step);
                  }
                  groups.sort((a, b) => a.iter - b.iter);
                  return groups.flatMap((group) => {
                    const els: React.ReactNode[] = [];
                    if (group.iter > 0) {
                      els.push(
                        <div key={`sep-${group.iter}`} className="flex items-center gap-2 py-1">
                          <div className="flex-1 border-t border-dashed border-orange-300" />
                          <span className="text-[10px] font-medium text-orange-500 uppercase tracking-wider">⟳ Run {group.iter}</span>
                          <div className="flex-1 border-t border-dashed border-orange-300" />
                        </div>
                      );
                    }
                    group.steps.forEach((step, i) => {
                      els.push(
                        <StepCard
                          key={step.nodeId + group.iter + i}
                          step={step}
                          expanded={expanded[step.nodeId + group.iter + i] || false}
                          onToggle={() => toggle(step.nodeId + group.iter + i)}
                        />
                      );
                    });
                    return els;
                  });
                })()}

            {hitlPause && (
              <div className="mt-4 bg-secondary-container border border-secondary rounded-lg p-4">
                <h3 className="text-sm font-semibold text-on-secondary-container mb-2">Human-in-the-Loop — Approval Required</h3>
                <div className="prose prose-sm max-w-none text-on-secondary-container bg-surface rounded border p-3 max-h-48 overflow-y-auto">{hitlPause.prompt}</div>
                {hitlPause.allowFeedback && (
                  <textarea
                    value={hitlFeedback}
                    onChange={(e) => setHitlFeedback(e.target.value)}
                    placeholder="Provide feedback to the reviewer..."
                    className="w-full text-sm border border-outline rounded-lg px-3 py-2 resize-none bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary mt-2"
                    rows={2}
                  />
                )}
                <div className="flex gap-2">
                  {hitlPause.buttons.map(btn => (
                    <button key={btn.value} onClick={() => handleHitlApprove(btn.value)}
                      className="m3-button text-sm bg-secondary flex items-center gap-1">
                      {btn.icon && <Icon name={btn.icon} className="text-sm" />}
                      {btn.label}
                    </button>
                  ))}
                  {!hitlPause.buttons.some(b => b.value === 'rejected') && (
                    <button onClick={handleHitlReject}
                      className="m3-button-outlined text-sm">
                      Reject
                    </button>
                  )}
                </div>
              </div>
            )}

            {finalOutput && (
              <div className="mt-4 bg-success-container border border-success rounded-lg p-4">
                <h3 className="text-sm font-semibold text-success mb-2">Final Output</h3>
                <pre className="text-xs whitespace-pre-wrap break-all text-success max-h-48 overflow-y-auto">{typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2)}</pre>
              </div>
            )}

            {error && !steps.some(s => s.error) && (
              <div className="mt-4 bg-error-container border border-error rounded-lg p-4 flex items-start gap-3">
                <Icon name="warning" className="text-2xl text-error mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-error mb-1">Execution Failed</h3>
                  <p className="text-xs text-error font-mono break-all">{error}</p>
                </div>
              </div>
            )}

            <div ref={logEndRef} />
          </div>
        )}
      </div>
    )}
    </div>
    </div>
  );
}
