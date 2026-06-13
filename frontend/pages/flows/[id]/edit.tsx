import { useRouter } from 'next/router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api-client';
import { FlowEditor } from '@/components/flow/FlowEditor';
import { NodeCatalog } from '@/components/flow/NodeCatalog';
import { ExecutionPanel } from '@/components/flow/ExecutionPanel';
import { LLMAgentConfig } from '@/components/flow/config/LLMAgentConfig';
import { MCPToolConfig } from '@/components/flow/config/MCPToolConfig';
import { DebugOverlay } from '@/components/flow/DebugOverlay';
import { RetrieverConfig } from '@/components/flow/config/RetrieverConfig';
import { Save, ArrowLeft, Settings, X, Trash2, Bug, History } from 'lucide-react';
import Link from 'next/link';

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  'llm-agent': 'LLM Agent',
  'mcp-tool': 'MCP Tool',
  retriever: 'Retriever',
  branch: 'Condition',
  code: 'Code',
  output: 'Output',
};

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
  const [showDebug, setShowDebug] = useState(false);

  // Selected node for config editing
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

      const updated = await api.flows.update(flow.id, {
        ...flow,
        nodes: ordered,
        edges,
      });
      setFlow(updated);
    } finally {
      setSaving(false);
    }
  }, [flow, nodes, edges]);

  const handleAddNode = useCallback((type: string, defaultConfig: Record<string, any>) => {
    addNodeRef.current?.(type, defaultConfig);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    deleteNodeRef.current?.(selectedNodeId);
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const handleConfigChange = useCallback((newConfig: Record<string, any>) => {
    if (!selectedNodeId) return;
    // Apply immediately to FlowEditor via ref
    setNodeDataRef.current?.(selectedNodeId, newConfig);
    // Also update parent state for save
    setNodes((prev) => prev.map((n) =>
      n.id === selectedNodeId
        ? { ...n, data: { ...n.data, config: { ...n.data.config, ...newConfig } } }
        : n
    ));
  }, [selectedNodeId]);

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
      {/* Toolbar */}
      <div className="h-12 border-b bg-white flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/flows" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-4 h-4" /></Link>
          <input
            className="text-sm font-semibold border-none outline-none bg-transparent"
            value={flow.name}
            onChange={(e) => setFlow({ ...flow, name: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Manage LLM endpoints & MCP servers">
            <Settings className="w-4 h-4" />
          </Link>
          <Link
            href={`/flows/${flow.id}/executions`}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            title="Execution history & debug traces"
          >
            <History className="w-4 h-4" />
          </Link>
          <button
            onClick={() => setShowDebug(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors"
            title="Debug run — trace execution step by step"
          >
            <Bug className="w-3 h-3" /> Debug
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded text-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <NodeCatalog onAddNode={handleAddNode} />
        <div className="flex-1">
          <FlowEditor
            initialNodes={nodes}
            initialEdges={edges}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            addNodeCallbackRef={addNodeRef}
            setNodeDataCallbackRef={setNodeDataRef}
            deleteNodeCallbackRef={deleteNodeRef}
            onNodeClick={handleNodeClick}
          />
        </div>

        {/* Right panel: config or execution */}
        {selectedNode ? (
          <div className="w-80 border-l bg-white flex flex-col h-full">
            <div className="p-3 border-b flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold">
                {NODE_LABELS[selectedNode.data.type] || selectedNode.data.type}
              </h3>
              <div className="flex items-center gap-1">
                <button onClick={handleDeleteNode} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete node">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setSelectedNodeId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedNode.data.type === 'llm-agent' && (
                <LLMAgentConfig
                  config={selectedNode.data.config}
                  onChange={handleConfigChange}
                />
              )}
              {selectedNode.data.type === 'mcp-tool' && (
                <MCPToolConfig
                  config={selectedNode.data.config}
                  onChange={handleConfigChange}
                />
              )}
              {selectedNode.data.type === 'branch' && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Condition Expression</span>
                    <textarea
                      className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[80px] font-mono"
                      value={selectedNode.data.config.condition || ''}
                      onChange={(e) => handleConfigChange({ condition: e.target.value })}
                      placeholder="input.score > 0.5"
                      rows={3}
                    />
                    <p className="mt-1 text-[10px] text-gray-400">JavaScript expression. Use &apos;input&apos; to access the node input.</p>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Output Labels</span>
                    <input
                      className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                      value={(selectedNode.data.config.outputLabels || ['true', 'false']).join(', ')}
                      onChange={(e) => handleConfigChange({ outputLabels: e.target.value.split(',').map(s => s.trim()) })}
                      placeholder="true, false"
                    />
                    <p className="mt-1 text-[10px] text-gray-400">Comma-separated labels for each output handle.</p>
                  </label>
                </div>
              )}
              {selectedNode.data.type === 'code' && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">JavaScript Code</span>
                    <textarea
                      className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[120px] font-mono"
                      value={selectedNode.data.config.code || ''}
                      onChange={(e) => handleConfigChange({ code: e.target.value })}
                      placeholder="// Transform the input payload&#10;return payload;"
                      rows={6}
                    />
                    <p className="mt-1 text-[10px] text-gray-400">Return the transformed value from this function.</p>
                  </label>
                </div>
              )}
              {selectedNode.data.type === 'retriever' && (
                <RetrieverConfig
                  config={selectedNode.data.config}
                  onChange={handleConfigChange}
                />
              )}
              {selectedNode.data.type === 'trigger' && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Trigger Type</span>
                    <select
                      className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
                      value={selectedNode.data.config.triggerType || 'manual'}
                      onChange={(e) => handleConfigChange({ triggerType: e.target.value })}
                    >
                      <option value="manual">Manual</option>
                      <option value="chat">Chat</option>
                      <option value="webhook">Webhook</option>
                      <option value="schedule">Schedule</option>
                    </select>
                  </label>

                  {selectedNode.data.config.triggerType === 'webhook' && (
                    <>
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700">Webhook Secret</span>
                        <input
                          className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm font-mono"
                          value={selectedNode.data.config.webhookSecret || ''}
                          onChange={(e) => handleConfigChange({ webhookSecret: e.target.value })}
                          placeholder="Optional secret for verification"
                        />
                        <p className="mt-1 text-[10px] text-gray-400">Pass as ?secret=... in the webhook URL</p>
                      </label>
                      {flow && (
                        <div className="bg-gray-50 rounded p-2">
                          <p className="text-[10px] font-medium text-gray-500 mb-1">Webhook URL</p>
                          <code className="text-[10px] text-gray-700 break-all">
                            {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/webhook/{flow.id}{selectedNode.data.config.webhookSecret ? `?secret=${selectedNode.data.config.webhookSecret}` : ''}
                          </code>
                        </div>
                      )}
                    </>
                  )}

                  {selectedNode.data.config.triggerType === 'schedule' && (
                    <label className="block">
                      <span className="text-xs font-medium text-gray-700">Cron Expression</span>
                      <input
                        className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm font-mono"
                        value={selectedNode.data.config.cronExpression || ''}
                        onChange={(e) => handleConfigChange({ cronExpression: e.target.value })}
                        placeholder="*/5 * * * *"
                      />
                      <p className="mt-1 text-[10px] text-gray-400">
                        minute hour day-of-month month day-of-week. E.g. &quot;0 9 * * *&quot; = daily at 9am, &quot;*/15 * * * *&quot; = every 15 min
                      </p>
                    </label>
                  )}

                  {(selectedNode.data.config.triggerType === 'schedule' || selectedNode.data.config.triggerType === 'manual') && (
                    <label className="block">
                      <span className="text-xs font-medium text-gray-700">Input Message</span>
                      <textarea
                        className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[40px]"
                        value={selectedNode.data.config.scheduleInput || ''}
                        onChange={(e) => handleConfigChange({ scheduleInput: e.target.value })}
                        placeholder='What is the latest news about AI?'
                        rows={2}
                      />
                      <p className="mt-1 text-[10px] text-gray-400">Sent to the next node each trigger. Plain text becomes the message, JSON objects are passed as structured input.</p>
                    </label>
                  )}

                  {selectedNode.data.config.triggerType === 'webhook' && (
                    <label className="block">
                      <span className="text-xs font-medium text-gray-700">Expected Input Schema</span>
                      <textarea
                        className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[60px] font-mono"
                        value={selectedNode.data.config.inputSchema || ''}
                        onChange={(e) => handleConfigChange({ inputSchema: e.target.value })}
                        placeholder='{"message":"string","userId":"string","priority":"number"}'
                        rows={3}
                      />
                      <p className="mt-1 text-[10px] text-gray-400">Define required fields and types. Incoming POSTs are validated — invalid requests get 400.</p>
                    </label>
                  )}
                </div>
              )}
              {selectedNode.data.type === 'output' && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Output Format</span>
                    <select
                      className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
                      value={selectedNode.data.config.format || 'json'}
                      onChange={(e) => handleConfigChange({ format: e.target.value })}
                    >
                      <option value="json">JSON</option>
                      <option value="text">Text</option>
                      <option value="markdown">Markdown</option>
                    </select>
                  </label>
                </div>
              )}
              {selectedNode.data.type === 'parallel' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600">Drag nodes from the catalog onto the canvas and drop them inside the Parallel container. They will run concurrently with the same input and their outputs will be merged.</p>
                  <p className="text-[10px] text-gray-400">Tip: Drag an existing node into the dashed area to add it. Drag it out to remove it.</p>
                </div>
              )}
              {!['llm-agent', 'mcp-tool', 'branch', 'code', 'retriever', 'trigger', 'output', 'parallel'].includes(selectedNode.data.type) && (
                <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">{JSON.stringify(selectedNode.data.config, null, 2)}</pre>
              )}
            </div>
          </div>
        ) : (
          <ExecutionPanel
            isRunning={isRunning}
            onRun={handleRun}
            onStop={handleStop}
            events={events}
            output={output}
            error={error}
          />
        )}
      </div>

      {/* Debug overlay */}
      {showDebug && flow && (
        <DebugOverlay flowId={flow.id} onClose={() => setShowDebug(false)} />
      )}
    </div>
  );
}
