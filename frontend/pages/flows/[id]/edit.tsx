import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { FlowEditor } from '@/components/flow/FlowEditor';
import { NodeCatalog } from '@/components/flow/NodeCatalog';
import { NodeConfigModal } from '@/components/flow/NodeConfigModal';
import { DebugOverlay } from '@/components/flow/DebugOverlay';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import * as Separator from '@radix-ui/react-separator';
import { useTheme } from '@/hooks/useTheme';
import Link from 'next/link';
import { Tooltip } from '@/components/ui/Tooltip';
import { getNodeFields } from '@/components/flow/config/InputPreview';

export default function FlowEditPage() {
  const router = useRouter();
  const { id } = router.query;
  const [flow, setFlow] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const addNodeRef = useRef<((type: string, defaultConfig: Record<string, any>) => void) | null>(null);
  const setNodeDataRef = useRef<((nodeId: string, config: Record<string, any>) => void) | null>(null);
  const deleteNodeRef = useRef<((nodeId: string) => void) | null>(null);
  const setNodeLabelRef = useRef<((nodeId: string, label: string) => void) | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  useAssistantContext({ pageKey: 'flow:' + (flow?.id || ""), description: 'Editing flow' });

  // Selected node for config editing
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Check name uniqueness via API
  const [nameAvailable, setNameAvailable] = useState(true);
  useEffect(() => {
    if (!flow?.name?.trim()) { setNameAvailable(false); return; }
    const timer = setTimeout(() => {
      api.flows.checkName(flow.name.trim(), flow.id === 'new' ? undefined : flow.id).then(r => setNameAvailable(r.available)).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [flow?.name, flow?.id]);

  const isChatFlow = useMemo(() => nodes.some(n => n.data?.type === 'trigger' && n.data?.config?.triggerType === 'chat'), [nodes]);

  // Validation: save button disabled when flow name is empty or not unique
  const saveError = useMemo(() => {
    if (!flow?.name?.trim()) return 'Flow name is required';
    if (!nameAvailable) return 'Another flow with this name already exists';
    if (isChatFlow) {
      if (!nodes.some(n => n.data?.type === 'output')) return 'Chat flow: requires an Output node';
      for (const out of nodes) {
        if (out.data?.type !== 'output') continue;
        const fields = out.data?.config?.inputFields as string[] | undefined;
        if (!fields || fields.length !== 1) return 'Chat flow: each Output node must have exactly one field selected';
        const fp = fields[0];
        if (fp.includes('.')) {
          const dot = fp.indexOf('.');
          const rawLabel = fp.slice(0, dot);
          const fieldName = fp.slice(dot + 1);
          const upNode = nodes.find(n => (n.data?.label || n.data?.type || n.id) === rawLabel);
          if (upNode) {
            const nodeFields = getNodeFields(upNode);
            const fieldDef = nodeFields.find(f => f.name === fieldName);
            if (fieldDef && fieldDef.type !== 'string') return 'Chat flow: output field must be a string type (select e.g. message)';
          }
        } else {
          return 'Chat flow: select a specific field (e.g. Trigger.message) instead of the whole node';
        }
      }
    }
    return null;
  }, [flow?.name, nameAvailable, isChatFlow, nodes]);

  const hasErrors = saveError !== null;

  // Duplicate label detection
  const labelError = useMemo(() => {
    if (!selectedNodeId) return '';
    const selectedLabel = nodes.find(n => n.id === selectedNodeId)?.data?.label;
    if (!selectedLabel) return '';
    const dupe = nodes.find(n => n.id !== selectedNodeId && n.data?.label === selectedLabel);
    return dupe ? `Label "${selectedLabel}" is already used by another node` : '';
  }, [nodes, selectedNodeId]);

  // Compute node warnings (duplicate labels, etc.) and merge into node data
  useEffect(() => {
    const labelCounts = new Map<string, string[]>();
    for (const n of nodes) {
      const lbl = n.data?.label;
      if (!lbl) continue;
      const ids = labelCounts.get(lbl) || [];
      ids.push(n.id);
      labelCounts.set(lbl, ids);
    }
    const warnings = new Map<string, string[]>();
    for (const [lbl, ids] of labelCounts) {
      if (ids.length > 1) {
        for (const id of ids) {
          warnings.set(id, (warnings.get(id) || []).concat(`Duplicate label: "${lbl}"`));
        }
      }
    }
    setNodes(prev => prev.map(n => {
    const w = warnings.get(n.id);
    const currentWarnings = n.data?._warnings as string[] | undefined;
      if (currentWarnings === undefined && !w) return n;
      if (currentWarnings && w && JSON.stringify(currentWarnings) === JSON.stringify(w)) return n;
      return { ...n, data: { ...n.data, _warnings: w || undefined } };
    }));
  }, [nodes.map(n => n.data?.label).join(',')]);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Undo/Redo ──────────────────────────────────────────
  const undoStackRef = useRef<Array<{ nodes: any[]; edges: any[] }>>([]);
  const redoStackRef = useRef<Array<{ nodes: any[]; edges: any[] }>>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const snapshot = useCallback(() => {
    undoStackRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [nodes, edges]);

  const handleUndo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, [nodes, edges]);

  const handleRedo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    setNodes(next.nodes);
    setEdges(next.edges);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, [nodes, edges]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    if (!id) return;
    if (typeof id !== 'string') return;
    if (id === 'new') {
      const triggerNode = {
        id: `node_${Date.now()}_trigger`,
        type: 'trigger',
        position: { x: 100, y: 200 },
        data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual', inputSchema: '' } },
      };
      setFlow({
        id: 'new',
        name: 'New Flow',
        description: '',
        nodes: [triggerNode],
        edges: [],
        version: 1,
      });
      setNodes([triggerNode]);
      setLoading(false);
      return;
    }
    api.flows.get(id).then((f) => {
      setFlow(f);
      const raw = f.nodes || [];
      const ordered = [...raw.filter((n: any) => n.type === 'parallel'), ...raw.filter((n: any) => n.type !== 'parallel')];
      setNodes(ordered);
      setEdges(f.edges || []);
    }).catch((err) => {
      console.error('Failed to load flow:', err);
    }).finally(() => setLoading(false));
  }, [id]);

  // Auto-open debug overlay from ?debug=1
  useEffect(() => {
    if (router.query.debug === '1') setShowDebug(true);
  }, [router.query.debug]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistFlow = useCallback(async (updates: Record<string, any>) => {
    if (!flow) return;
    if (flow.id === 'new') {
      const created = await api.flows.create({ ...flow, ...updates });
      setFlow(created);
      router.replace(`/flows/${created.id}/edit`);
    } else {
      const updated = await api.flows.update(flow.id, { ...flow, ...updates });
      setFlow(updated);
    }
  }, [flow, router]);

  const handleSave = useCallback(async () => {
    if (!flow || hasErrors) return;
    setSaving(true);
    try {
      // Sync child nodes into parallel node configs, ensure parent nodes come first
      const syncedNodes = nodes.map(n => {
        if (n.type === 'parallel') {
          const children = nodes.filter(c => c.parentId === n.id);
          return { ...n, data: { ...n.data, config: { ...n.data.config, subNodes: children } } };
        }
        return n;
      });
      // Sort: parallel nodes first, then children, then others
      const ordered = [...syncedNodes.filter(n => n.type === 'parallel'), ...syncedNodes.filter(n => n.type !== 'parallel')];

      await persistFlow({ nodes: ordered, edges });
    } finally {
      setSaving(false);
    }
  }, [flow, nodes, edges, persistFlow]);

  const handleAddNode = useCallback((type: string, defaultConfig: Record<string, any>) => {
    if (type === 'hitl' && isChatFlow) return;
    snapshot();
    addNodeRef.current?.(type, defaultConfig);
  }, [snapshot, isChatFlow]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    const node = nodes.find(n => n.id === selectedNodeId);
    if (node?.data?.type === 'trigger') return;
    snapshot();
    deleteNodeRef.current?.(selectedNodeId);
    setSelectedNodeId(null);
  }, [selectedNodeId, nodes, snapshot]);

  const handleConfigChange = useCallback((newConfig: Record<string, any>) => {
    if (!selectedNodeId) return;
    snapshot();
    setNodeDataRef.current?.(selectedNodeId, newConfig);
    setNodes((prev) => prev.map((n) =>
      n.id === selectedNodeId
        ? { ...n, data: { ...n.data, config: { ...n.data.config, ...newConfig } } }
        : n
    ));
  }, [selectedNodeId, snapshot]);

  const handleLabelChange = useCallback((label: string) => {
    if (!selectedNodeId) return;
    snapshot();
    setNodeLabelRef.current?.(selectedNodeId, label);
    setNodes((prev: any[]) => prev.map((n: any) => {
      if (n.id !== selectedNodeId) return n;
      return { ...n, data: { ...n.data, label, _warnings: undefined } };
    }));
  }, [selectedNodeId, snapshot]);

  const abortRef = useRef<AbortController | null>(null);

  const handleRun = async (inputStr: string) => {
    setEvents([]);
    setOutput(null);
    setError(null);
    setSelectedNodeId(null);
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let input: any;
    try { input = JSON.parse(inputStr); } catch { input = { message: inputStr }; }

    try {
      const eventStream = api.flows.executeStream(flow.id, input, controller.signal);

      for await (const event of eventStream) {
        setEvents((prev) => [...prev, event]);

        if (event.type === 'execution.completed') {
          setOutput(event.data.output);
        }
        if (event.type === 'execution.failed') {
          setError(event.data.error || 'Execution failed');
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err.message || 'Execution error');
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const { theme, toggle: toggleTheme } = useTheme();
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  if (loading) return <div className="flex items-center justify-center h-screen text-on-surface-variant">Loading flow...</div>;
  if (!flow) return <div className="flex items-center justify-center h-screen text-on-surface-variant">Flow not found</div>;

  return (
    <div className="h-screen flex flex-col">
      {/* Floating top bar — title & description */}
      <div className="pointer-events-none fixed inset-x-0 top-3 flex justify-center z-40">
        <div className="pointer-events-auto flex items-center gap-2 bg-surface/90 backdrop-blur border rounded-lg shadow-sm px-3 py-1.5">
          <Link href="/" className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-on-surface-variant shrink-0"><Icon name="arrow_back" className="text-sm" /> <span>Back</span></Link>
          <TextField label="Flow name" value={flow.name} onChange={(v) => setFlow((prev: any) => ({ ...prev, name: v }))} className="min-w-[80px] max-w-[160px]" />
          <TextField label="Description" value={flow.description || ''} onChange={(v) => setFlow((prev: any) => ({ ...prev, description: v }))} className="min-w-[100px] max-w-[200px] focus:max-w-[400px] transition-all" />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          <FlowEditor
            initialNodes={nodes}
            initialEdges={edges}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            addNodeCallbackRef={addNodeRef}
            setNodeDataCallbackRef={setNodeDataRef}
            deleteNodeCallbackRef={deleteNodeRef}
            setNodeLabelRef={setNodeLabelRef}
            onNodeClick={handleNodeClick}
            onNodeDragStart={() => snapshot()}
          />
        </div>

        {selectedNode && (
          <NodeConfigModal
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            flowId={flow.id}
            onConfigChange={handleConfigChange}
            onLabelChange={handleLabelChange}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
            labelError={labelError}
          />
        )}
      </div>

      {/* Backdrop for catalog */}
      {showCatalog && (
        <div className="fixed inset-0 z-30" onClick={() => setShowCatalog(false)} />
      )}

      {/* Floating add node — left side */}
      <div className="pointer-events-none fixed left-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center">
        <Tooltip content="Add node">
          <button id="add-node-btn" onClick={() => setShowCatalog(p => !p)} className="pointer-events-auto w-10 h-10 bg-primary border-2 border-primary rounded-xl shadow-lg flex items-center justify-center text-white hover:bg-primary hover:shadow-xl transition-all">
            <Icon name="add" className="text-xl" />
          </button>
        </Tooltip>
        <span className="pointer-events-auto mt-1.5 text-[9px] text-primary font-bold tracking-wider uppercase">Add Node</span>
        {showCatalog && (
          <div className="pointer-events-auto fixed left-16 top-1/2 -translate-y-1/2 z-40">
            <NodeCatalog onAddNode={(type, config) => { handleAddNode(type, config); setShowCatalog(false); }} onClose={() => setShowCatalog(false)} disabledTypes={isChatFlow ? ['hitl'] : []} disabledReasons={{ hitl: 'HITL is not supported in chat-triggered flows' }} />
          </div>
        )}
      </div>

      {/* Floating bottom bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center z-40">
        <div className="pointer-events-auto flex items-center gap-1 bg-surface border rounded-lg shadow-lg px-2 py-1.5">
          <Tooltip content="Undo (Ctrl+Z)">
            <button onClick={handleUndo} disabled={!canUndo} className="flex items-center gap-1 px-1.5 py-1 text-xs text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded hover:bg-surface-container-high">
              <Icon name="undo" className="text-sm" /> Undo
            </button>
          </Tooltip>
          <Separator.Root orientation="vertical" className="w-px h-4 bg-outline-variant" />
          <Tooltip content="Redo (Ctrl+Shift+Z)">
            <button onClick={handleRedo} disabled={!canRedo} className="flex items-center gap-1 px-1.5 py-1 text-xs text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded hover:bg-surface-container-high">
              <Icon name="redo" className="text-sm" /> Redo
            </button>
          </Tooltip>
          <Separator.Root orientation="vertical" className="w-px h-4 bg-outline-variant mx-0.5" />
          <Tooltip content="Manage LLM endpoints & MCP servers">
            <Link href="/settings" className="flex items-center gap-1 px-1.5 py-1 text-xs text-on-surface-variant hover:text-on-surface-variant transition-colors rounded hover:bg-surface-container-high">
              <Icon name="settings" className="text-sm" /> Settings
            </Link>
          </Tooltip>
          <Tooltip content="Run history">
            <Link href={`/flows/${flow?.id}/executions`} className="flex items-center gap-1 px-1.5 py-1 text-xs text-on-surface-variant hover:text-on-surface-variant transition-colors rounded hover:bg-surface-container-high">
              <Icon name="history" className="text-sm" /> Runs
            </Link>
          </Tooltip>
          <Tooltip content="Debug run — trace execution step by step">
            <button onClick={() => setShowDebug(true)} className="flex items-center gap-1 px-1.5 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container transition-colors rounded">
              <Icon name="bug_report" className="text-sm" /> Debug
            </button>
          </Tooltip>
          <Separator.Root orientation="vertical" className="w-px h-4 bg-outline-variant" />
          <Tooltip content={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            <button onClick={toggleTheme} className="flex items-center gap-1 px-1.5 py-1 text-xs text-on-surface-variant hover:text-on-surface-variant transition-colors rounded hover:bg-surface-container-high">
              {theme === 'light' ? <Icon name="dark_mode" className="text-sm" /> : <Icon name="light_mode" className="text-sm" />} {theme === 'light' ? 'Dark' : 'Light'}
            </button>
          </Tooltip>
          <Separator.Root orientation="vertical" className="w-px h-4 bg-outline-variant" />
          {hasErrors ? (
            <Tooltip content={saveError!}>
              <button onClick={handleSave} disabled={saving || hasErrors} className="m3-button disabled:opacity-50">
                <Icon name="save" className="text-sm" /> {saving ? 'Saving...' : 'Save'}
              </button>
            </Tooltip>
          ) : (
            <button onClick={handleSave} disabled={saving || hasErrors} className="m3-button disabled:opacity-50">
              <Icon name="save" className="text-sm" /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Debug overlay */}
      {showDebug && flow && (
        <DebugOverlay flowId={flow.id} nodes={nodes} edges={edges} onClose={() => setShowDebug(false)} />
      )}
    </div>
  );
}
