import { useCallback, useEffect, useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import { getUpstreamNodeIds, getNodeFields } from '@/components/flow/config/InputPreview';
import { LLMAgentConfig } from '@/components/flow/config/LLMAgentConfig';
import { MCPToolConfig } from '@/components/flow/config/MCPToolConfig';
import { RetrieverConfig } from '@/components/flow/config/RetrieverConfig';
import { TemplateAutocomplete } from '@/components/flow/config/TemplateAutocomplete';
import { HITLNodeConfig } from '@/components/flow/config/HITLNodeConfig';

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  'llm-agent': 'LLM Agent',
  'mcp-tool': 'MCP Tool',
  retriever: 'Retriever',
  branch: 'Condition',
  code: 'Code',
  output: 'Output',
  parallel: 'Parallel',
  hitl: 'Human in the Loop',
};

interface NodeConfigModalProps {
  node: any;
  nodes: any[];
  edges: any[];
  flowId: string;
  onConfigChange: (config: Record<string, any>) => void;
  onLabelChange: (label: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function NodeConfigModal({
  node,
  nodes,
  edges,
  flowId,
  onConfigChange,
  onLabelChange,
  onDelete,
  onClose,
}: NodeConfigModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // Compute upstream node labels for the input selection UI
  const upstreamLabels = useMemo(() => {
    const upstreamIds = getUpstreamNodeIds(node.id, edges);
    const names = new Set<string>();
    for (const upId of upstreamIds) {
      const upNode = nodes.find((n) => n.id === upId);
      if (!upNode) continue;
      names.add(upNode.data?.label || upNode.data?.type || upId);
    }
    return Array.from(names);
  }, [node.id, edges, nodes]);

  const configInputFields: string[] = node.data.config?.inputFields || [];

  // Toggle a single input field
  const toggleField = useCallback(
    (fieldPath: string) => {
      const current: string[] = node.data.config?.inputFields || [];
      if (current.includes(fieldPath)) {
        onConfigChange({ inputFields: current.filter((f) => f !== fieldPath) });
      } else if (!fieldPath.includes('.')) {
        // Toggling a label: remove per-field entries for this label, just use label
        onConfigChange({ inputFields: [...current.filter(f => f.split('.')[0] !== fieldPath), fieldPath] });
      } else {
        // Toggling a specific field
        const label = fieldPath.split('.')[0];
        // If label was selected by label key, remove the label key and use per-field
        const withoutLabel = current.filter(f => f !== label);
        onConfigChange({ inputFields: [...withoutLabel, fieldPath] });
      }
    },
    [node.data.config?.inputFields, onConfigChange],
  );

  // Check if a specific field path is selected
  const isFieldSelected = useCallback((fieldPath: string): boolean => {
    const current: string[] = node.data.config?.inputFields || [];
    if (current.length === 0) return true; // empty = all pass through
    const label = fieldPath.split('.')[0];
    // If the whole label is selected, all its fields are selected
    if (current.includes(label)) return true;
    return current.includes(fieldPath);
  }, [node.data.config?.inputFields]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-12"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider bg-gray-100 px-2 py-0.5 rounded">
              {NODE_LABELS[node.data.type] || node.data.type}
            </span>
            <input
              className="text-sm font-semibold border border-gray-200 rounded px-2 py-1 w-48"
              value={node.data.label || ''}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="Node name..."
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
              title="Delete node"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Input Field Selection ── */}
          {upstreamLabels.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Select Input Nodes
              </h4>
              <div className="bg-white border border-gray-200 rounded p-2 space-y-1">
                {upstreamLabels.map((label) => {
                  const upNode = nodes.find(n => (n.data?.label || n.data?.type || n.id) === label);
                  const fields = upNode ? getNodeFields(upNode) : [];
                  const labelSelected = configInputFields.includes(label);
                  return (
                    <div key={label}>
                      <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={labelSelected}
                          onChange={() => toggleField(label)}
                          className="w-3 h-3 accent-blue-500"
                        />
                        <span className="text-xs font-semibold text-gray-800">{label}</span>
                        <span className="text-[10px] text-gray-400">({fields.length} fields)</span>
                      </label>
                      {fields.length > 0 && (
                        <div className="ml-5 pl-3 border-l border-gray-200 space-y-0.5 mb-1">
                          {fields.map((f) => {
                            const fp = `${label}.${f.name}`;
                            const checked = labelSelected || configInputFields.includes(fp);
                            return (
                              <label key={fp} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleField(fp)}
                                  className="w-2.5 h-2.5 accent-blue-400"
                                />
                                <span className="text-[10px] font-mono text-gray-500">{f.name}</span>
                                <span className="text-[9px] text-gray-300">: {f.type}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {configInputFields.length === 0 && upstreamLabels.length > 0 && (
                  <p className="text-[10px] text-gray-400 italic pt-1 border-t border-gray-100 mt-1">
                    None selected = all data passes through
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Node-specific config form ── */}
          {node.data.type === 'llm-agent' && (
            <LLMAgentConfig config={node.data.config} onChange={onConfigChange} suggestions={{ upstreamLabels, nodes, edges, nodeId: node.id }} />
          )}

          {node.data.type === 'mcp-tool' && (
            <MCPToolConfig config={node.data.config} onChange={onConfigChange} />
          )}

          {node.data.type === 'branch' && (
            <div>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Condition Expression</span>
                <TemplateAutocomplete
                  value={node.data.config.condition || ''}
                  onChange={(v) => onConfigChange({ condition: v })}
                  placeholder="input.score > 0.5"
                  rows={3}
                  nodeId={node.id}
                  nodes={nodes}
                  edges={edges}
                  selectedFields={node.data.config?.inputFields}
                  className="min-h-[60px]"
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Type &#x7B;&#x7B; to reference upstream data as &#x7B;&#x7B;input.Label.field&#x7D;&#x7D;.
                </p>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 block mb-1">Output Labels</span>
                <div className="space-y-1.5">
                  {(node.data.config.outputLabels || ['true', 'false']).map((label: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className="flex-1 rounded border border-gray-300 p-2 text-sm"
                        value={label}
                        onChange={(e) => {
                          const list = [...(node.data.config.outputLabels || ['true', 'false'])];
                          list[i] = e.target.value;
                          onConfigChange({ outputLabels: list });
                        }}
                        placeholder="Label"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const list = [...(node.data.config.outputLabels || ['true', 'false'])];
                          list.splice(i, 1);
                          onConfigChange({ outputLabels: list.length > 0 ? list : ['true', 'false'] });
                        }}
                        className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 shrink-0 font-bold"
                      >✕</button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const list = [...(node.data.config.outputLabels || ['true', 'false'])];
                      onConfigChange({ outputLabels: [...list, ''] });
                    }}
                    className="text-sm text-blue-600 hover:underline block"
                  >+ Add label</button>
                </div>
              </label>
            </div>
          )}

          {node.data.type === 'code' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">JavaScript Code</span>
                <textarea
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[120px] font-mono"
                  value={node.data.config.code || ''}
                  onChange={(e) => onConfigChange({ code: e.target.value })}
                  placeholder="// input contains all upstream data&#10;return input;"
                  rows={6}
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Use <code className="font-mono">input</code> to access upstream data. Return the transformed value.
                </p>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">
                  Output Structure (documentation)
                </span>
                <textarea
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[40px] font-mono"
                  value={node.data.config.outputSchema || ''}
                  onChange={(e) => onConfigChange({ outputSchema: e.target.value })}
                  placeholder='{"type":"object","properties":{"result":{"type":"string"}}}'
                  rows={2}
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Optional. Documents what this node outputs so downstream nodes can reference
                  the structure.
                </p>
              </label>
            </div>
          )}

          {node.data.type === 'retriever' && (
            <RetrieverConfig config={node.data.config} onChange={onConfigChange} />
          )}

          {node.data.type === 'trigger' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Trigger Type</span>
                <select
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
                  value={node.data.config.triggerType || 'manual'}
                  onChange={(e) => onConfigChange({ triggerType: e.target.value })}
                >
                  <option value="manual">Manual</option>
                  <option value="chat">Chat</option>
                  <option value="webhook">Webhook</option>
                  <option value="schedule">Schedule</option>
                </select>
              </label>

              {node.data.config.triggerType === 'webhook' && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Webhook Secret</span>
                    <input
                      className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm font-mono"
                      value={node.data.config.webhookSecret || ''}
                      onChange={(e) => onConfigChange({ webhookSecret: e.target.value })}
                      placeholder="Optional secret for verification"
                    />
                    <p className="mt-1 text-[10px] text-gray-400">
                      Pass as ?secret=... in the webhook URL
                    </p>
                  </label>
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-[10px] font-medium text-gray-500 mb-1">Webhook URL</p>
                    <code className="text-[10px] text-gray-700 break-all">
                      {process.env.NEXT_PUBLIC_API_URL || '/api'}/webhook/
                      {flowId}
                      {node.data.config.webhookSecret ? '?secret=••••••••' : ''}
                    </code>
                  </div>
                </>
              )}

              {node.data.config.triggerType === 'schedule' && (
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Cron Expression</span>
                  <input
                    className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm font-mono"
                    value={node.data.config.cronExpression || ''}
                    onChange={(e) => onConfigChange({ cronExpression: e.target.value })}
                    placeholder="*/5 * * * *"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    minute hour day-of-month month day-of-week. E.g. &quot;0 9 * * *&quot; = daily
                    at 9am, &quot;*/15 * * * *&quot; = every 15 min
                  </p>
                </label>
              )}

              {(node.data.config.triggerType === 'schedule' ||
                node.data.config.triggerType === 'manual') && (
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Input Message</span>
                  <textarea
                    className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[40px]"
                    value={node.data.config.inputMessage || ''}
                    onChange={(e) => onConfigChange({ inputMessage: e.target.value })}
                    placeholder="What is the latest news about AI?"
                    rows={2}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Sent to the next node each trigger. Plain text becomes the message, JSON objects
                    are passed as structured input.
                  </p>
                </label>
              )}

              {node.data.config.triggerType === 'webhook' && (
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">
                    Expected Input Schema
                  </span>
                  <textarea
                    className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[60px] font-mono"
                    value={node.data.config.inputSchema || ''}
                    onChange={(e) => onConfigChange({ inputSchema: e.target.value })}
                    placeholder='{"message":"string","userId":"string","priority":"number"}'
                    rows={3}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Define required fields and types. Incoming POSTs are validated — invalid requests
                    get 400.
                  </p>
                </label>
              )}
            </div>
          )}

          {node.data.type === 'output' && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 bg-gray-50 rounded border p-2">
                <p className="font-medium text-gray-700 mb-1">Output behavior</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>No fields selected → all accumulated data (JSON)</li>
                  <li>One field selected → just the field value</li>
                  <li>Multiple fields selected → combined as JSON object</li>
                </ul>
              </div>
            </div>
          )}

          {node.data.type === 'parallel' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-600">
                Drag nodes from the catalog onto the canvas and drop them inside the Parallel
                container. They will run concurrently with the same input and their outputs will be
                merged.
              </p>
              <p className="text-[10px] text-gray-400">
                Tip: Drag an existing node into the dashed area to add it. Drag it out to remove it.
              </p>
            </div>
          )}

          {node.data.type === 'hitl' && (
            <HITLNodeConfig
              config={node.data.config}
              onChange={onConfigChange}
              nodeId={node.id}
              nodes={nodes}
              edges={edges}
            />
          )}

          {![
            'llm-agent',
            'mcp-tool',
            'branch',
            'code',
            'retriever',
            'trigger',
            'output',
            'parallel',
            'hitl',
          ].includes(node.data.type) && (
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
              {JSON.stringify(node.data.config, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
