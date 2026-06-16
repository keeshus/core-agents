import { useCallback, useEffect, useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import { InputPreview, getUpstreamNodeIds, getNodeFields } from '@/components/flow/config/InputPreview';
import { LLMAgentConfig } from '@/components/flow/config/LLMAgentConfig';
import { MCPToolConfig } from '@/components/flow/config/MCPToolConfig';
import { RetrieverConfig } from '@/components/flow/config/RetrieverConfig';

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

  // Compute accumulated upstream field names for the input selection UI
  const upstreamFieldNames = useMemo(() => {
    const upstreamIds = getUpstreamNodeIds(node.id, edges);
    const names = new Set<string>();
    for (const upId of upstreamIds) {
      const upNode = nodes.find((n) => n.id === upId);
      if (!upNode) continue;
      const fields = getNodeFields(upNode);
      for (const f of fields) names.add(f.name);
    }
    return Array.from(names);
  }, [node.id, edges, nodes]);

  const configInputFields: string[] = node.data.config?.inputFields || [];
  const allFields = configInputFields.length === 0;

  // Fields that are currently filtered out (unchecked) — derived for InputPreview display
  const filteredFields = useMemo(() => {
    if (allFields) return [];
    return upstreamFieldNames.filter((f) => !configInputFields.includes(f));
  }, [allFields, upstreamFieldNames, configInputFields]);

  // Toggle a single input field
  const toggleField = useCallback(
    (fieldName: string) => {
      const current: string[] = node.data.config?.inputFields || [];
      let updated: string[];
      if (current.includes(fieldName)) {
        updated = current.filter((f) => f !== fieldName);
      } else {
        updated = [...current, fieldName];
      }
      // If all upstream fields are checked, normalize to empty array (means "all fields")
      if (updated.length === upstreamFieldNames.length) {
        updated = [];
      }
      onConfigChange({ inputFields: updated });
    },
    [node.data.config?.inputFields, upstreamFieldNames, onConfigChange],
  );

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
          {/* Incoming Data Shape (read-only preview with checkbox indicators) */}
          <InputPreview
            edges={edges}
            nodes={nodes}
            selectedNodeId={node.id}
            inputFields={configInputFields}
            filteredFields={filteredFields}
          />

          {/* ── Input Field Selection ── */}
          {upstreamFieldNames.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Select Input Fields
              </h4>
              <div className="bg-white border border-gray-200 rounded p-2 space-y-1">
                {upstreamFieldNames.map((fieldName) => {
                  const isChecked = allFields || configInputFields.includes(fieldName);
                  return (
                    <label
                      key={fieldName}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleField(fieldName)}
                        className="w-3 h-3 accent-blue-500"
                      />
                      <span className="text-xs font-mono text-gray-700">{fieldName}</span>
                    </label>
                  );
                })}
                {allFields && upstreamFieldNames.length > 0 && (
                  <p className="text-[10px] text-gray-400 italic pt-1 border-t border-gray-100 mt-1">
                    All fields passed through
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Node-specific config form ── */}
          {node.data.type === 'llm-agent' && (
            <LLMAgentConfig config={node.data.config} onChange={onConfigChange} />
          )}

          {node.data.type === 'mcp-tool' && (
            <MCPToolConfig config={node.data.config} onChange={onConfigChange} />
          )}

          {node.data.type === 'branch' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Condition Expression</span>
                <textarea
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[80px] font-mono"
                  value={node.data.config.condition || ''}
                  onChange={(e) => onConfigChange({ condition: e.target.value })}
                  placeholder="input.score > 0.5"
                  rows={3}
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  JavaScript expression. Use &apos;input&apos; to access the node input.
                </p>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Output Labels</span>
                <input
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                  value={(node.data.config.outputLabels || ['true', 'false']).join(', ')}
                  onChange={(e) =>
                    onConfigChange({
                      outputLabels: e.target.value.split(',').map((s) => s.trim()),
                    })
                  }
                  placeholder="true, false"
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Comma-separated labels for each output handle.
                </p>
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
                  placeholder="// Transform the input payload&#10;return payload;"
                  rows={6}
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Return the transformed value from this function.
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
                      {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/webhook/
                      {flowId}
                      {node.data.config.webhookSecret
                        ? `?secret=${node.data.config.webhookSecret}`
                        : ''}
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
                    value={node.data.config.scheduleInput || ''}
                    onChange={(e) => onConfigChange({ scheduleInput: e.target.value })}
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
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Output Format</span>
                <select
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
                  value={node.data.config.format || 'json'}
                  onChange={(e) => onConfigChange({ format: e.target.value })}
                >
                  <option value="json">JSON</option>
                  <option value="text">Text</option>
                  <option value="markdown">Markdown</option>
                </select>
              </label>
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
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Prompt for the User</span>
                <textarea
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[60px]"
                  value={node.data.config.prompt || ''}
                  onChange={(e) => onConfigChange({ prompt: e.target.value })}
                  placeholder="Please review the generated content before proceeding..."
                  rows={3}
                />
              </label>
              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-700 block">Buttons</span>
                {(
                  node.data.config.buttons || [
                    { label: 'Approve', value: 'approved' },
                    { label: 'Reject', value: 'rejected' },
                  ]
                ).map((btn: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded border border-gray-300 p-2 text-sm"
                      value={btn.label}
                      onChange={(e) => {
                        const btns = [...(node.data.config.buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }])];
                        btns[i] = { ...btns[i], label: e.target.value };
                        onConfigChange({ buttons: btns });
                      }}
                      placeholder="Button label"
                    />
                    <input
                      className="flex-1 rounded border border-gray-300 p-2 text-sm font-mono"
                      value={btn.value}
                      onChange={(e) => {
                        const btns = [...(node.data.config.buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }])];
                        btns[i] = { ...btns[i], value: e.target.value };
                        onConfigChange({ buttons: btns });
                      }}
                      placeholder="value"
                    />
                    <button
                      onClick={() => {
                        const btns = [
                          ...(node.data.config.buttons || [
                            { label: 'Approve', value: 'approved' },
                            { label: 'Reject', value: 'rejected' },
                          ]),
                        ];
                        btns.splice(i, 1);
                        onConfigChange({
                          buttons: btns.length > 0 ? btns : [{ label: 'Approve', value: 'approved' }],
                        });
                      }}
                      className="w-6 h-6 flex items-center justify-center text-xs bg-red-200 text-red-800 rounded hover:bg-red-300 shrink-0 font-bold"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const btns = [
                      ...(node.data.config.buttons || [
                        { label: 'Approve', value: 'approved' },
                        { label: 'Reject', value: 'rejected' },
                      ]),
                    ];
                    onConfigChange({ buttons: [...btns, { label: '', value: '' }] });
                  }}
                  className="text-sm text-blue-600 hover:underline block"
                >
                  + Add Button
                </button>
              </div>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  Fields to Display (what the user sees)
                </span>
                <input
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                  value={(node.data.config.displayFields || []).join(', ')}
                  onChange={(e) =>
                    onConfigChange({
                      displayFields: e.target.value
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="transactions, summary"
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Only these fields are shown to the reviewer. Empty = show all.
                </p>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">
                  Fields to Forward (what passes to the next node)
                </span>
                <input
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                  value={(node.data.config.forwardFields || []).join(', ')}
                  onChange={(e) =>
                    onConfigChange({
                      forwardFields: e.target.value
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="transactions"
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Only these fields from the reviewed content are passed downstream. Empty = forward
                  everything.
                </p>
              </label>
            </div>
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
