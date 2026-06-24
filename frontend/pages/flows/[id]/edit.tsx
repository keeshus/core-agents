import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api-client';
import { FlowEditor } from '@/components/flow/FlowEditor';
import { NodeCatalog } from '@/components/flow/NodeCatalog';
import { NodeConfigModal } from '@/components/flow/NodeConfigModal';
import { DebugOverlay } from '@/components/flow/DebugOverlay';
import { Save, ArrowLeft, Settings, Bug, History, Undo2, Redo2 } from 'lucide-react';
import Link from 'next/link';

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
  useAssistantContext({ pageKey: 'flow:' + (flow?.id || ""), description: 'Editing flow "' + (flow?.name || "") + '"' });

  // Selected node for config editing
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
    if (id) {
      api.flows.get(id as string).then((f) => {
        setFlow(f);
        // Sort: parallel nodes first (parent before children)
        const raw = f.nodes || [];
        const ordered = [...raw.filter((n: any) => n.type === 'parallel'), ...raw.filter((n: any) => n.type !== 'parallel')];
        setNodes(ordered);
        setEdges(f.edges || []);
      }).finally(() => setLoading(false));
    }
  }, [id]);

  // Auto-open debug overlay from ?debug=1
  useEffect(() => {
    if (router.query.debug === '1') setShowDebug(true);
  }, [router.query.debug]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistFlow = useCallback(async (updates: Record<string, any>) => {
    if (!flow) return;
    const updated = await api.flows.update(flow.id, { ...flow, ...updates });
    setFlow(updated);
  }, [flow]);

  const autoSaveMeta = useCallback((field: string, value: string) => {
    setFlow((prev: any) => ({ ...prev, [field]: value }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persistFlow({ [field]: value }), 600);
  }, [persistFlow]);

  const handleSave = useCallback(async () => {
    if (!flow) return;
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
    snapshot();
    addNodeRef.current?.(type, defaultConfig);
  }, [snapshot]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    snapshot();
    deleteNodeRef.current?.(selectedNodeId);
    setSelectedNodeId(null);
  }, [selectedNodeId, snapshot]);

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
    setNodes((prev: any[]) => prev.map((n: any) =>
      n.id === selectedNodeId ? { ...n, data: { ...n.data, label } } : n
    ));
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

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading flow...</div>;
  if (!flow) return <div className="flex items-center justify-center h-screen text-gray-500">Flow not found</div>;

  return (
    <div className="h-screen flex flex-col">
      {/* Floating top bar — title & description */}
      <div className="pointer-events-none fixed inset-x-0 top-3 flex justify-center z-40">
        <div className="pointer-events-auto flex items-center gap-2 bg-white/90 backdrop-blur border rounded-lg shadow-sm px-3 py-1.5">
          <Link href="/" className="text-gray-400 hover:text-gray-600 shrink-0"><ArrowLeft className="w-3.5 h-3.5" /></Link>
          <input className="text-xs font-semibold border-none outline-none bg-transparent min-w-[80px] max-w-[160px]" value={flow.name} onChange={(e) => setFlow({ ...flow, name: e.target.value })} placeholder="Flow name" />
          <input className="text-[10px] text-gray-500 border-none outline-none bg-transparent min-w-[100px] max-w-[200px] focus:max-w-[400px] transition-all" value={flow.description || ''} onChange={(e) => setFlow({ ...flow, description: e.target.value })} placeholder="Add a description..." />
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
          />
        )}
      </div>

      {/* Backdrop for catalog */}
      {showCatalog && (
        <div className="fixed inset-0 z-40" onClick={() => setShowCatalog(false)} />
      )}

      {/* Floating add node — left side */}
      <div className="pointer-events-none fixed left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center">
        <button id="add-node-btn" onClick={() => setShowCatalog(p => !p)} className="pointer-events-auto w-10 h-10 bg-white border-2 border-dashed border-gray-300 rounded-xl shadow-md flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-400 hover:shadow-lg transition-all" title="Add node">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <span className="pointer-events-auto mt-1.5 text-[9px] text-gray-400 font-medium tracking-wider uppercase">Add Node</span>
        {showCatalog && (
          <div className="pointer-events-auto fixed left-16 top-1/2 -translate-y-1/2 z-50">
            <NodeCatalog onAddNode={(type, config) => { handleAddNode(type, config); setShowCatalog(false); }} onClose={() => setShowCatalog(false)} />
          </div>
        )}
      </div>

      {/* Floating bottom bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center z-40">
        <div className="pointer-events-auto flex items-center gap-1 bg-white border rounded-lg shadow-lg px-2 py-1.5">
          <button onClick={handleUndo} disabled={!canUndo} className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded hover:bg-gray-100" title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <button onClick={handleRedo} disabled={!canRedo} className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded hover:bg-gray-100" title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <Link href="/settings" className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded hover:bg-gray-100" title="Manage LLM endpoints & MCP servers">
            <Settings className="w-4 h-4" />
          </Link>
          <Link href={`/flows/${flow?.id}/executions`} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded hover:bg-gray-100" title="Execution history & debug traces">
            <History className="w-4 h-4" />
          </Link>
          <button onClick={() => setShowDebug(true)} className="p-1.5 text-gray-400 hover:text-purple-600 transition-colors rounded hover:bg-gray-100" title="Debug run — trace execution step by step">
            <Bug className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors">
            <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Debug overlay */}
      {showDebug && flow && (
        <DebugOverlay flowId={flow.id} nodes={nodes} edges={edges} onClose={() => setShowDebug(false)} />
      )}
    </div>
  );
}
