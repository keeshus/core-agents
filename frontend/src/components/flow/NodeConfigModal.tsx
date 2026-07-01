import { useCallback, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { getUpstreamNodeIds, getNodeFields } from '@/components/flow/config/InputPreview';
import { LLMAgentConfig } from '@/components/flow/config/LLMAgentConfig';
import { MCPToolConfig } from '@/components/flow/config/MCPToolConfig';
import { RetrieverConfig } from '@/components/flow/config/RetrieverConfig';
import { TemplateAutocomplete } from '@/components/flow/config/TemplateAutocomplete';
import { HITLNodeConfig } from '@/components/flow/config/HITLNodeConfig';
import { Tooltip } from '@/components/ui/Tooltip';

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
  labelError?: string;
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
  labelError,
}: NodeConfigModalProps) {
  // Compute upstream node labels for the input selection UI
  const upstreamLabels = useMemo(() => {
    // When inside a parallel, use the parallel's selected input fields as upstream
    if ((node as any).parentId) {
      const parent = nodes.find((n) => n.id === (node as any).parentId);
      const parentFields = (parent?.data as any)?.config?.inputFields as string[] | undefined;
      if (parentFields && parentFields.length > 0) {
        const names = new Set<string>();
        for (const f of parentFields) {
          const dot = f.indexOf('.');
          names.add(dot === -1 ? f : f.slice(0, dot));
        }
        return Array.from(names);
      }
      // No fields selected on parent — fall back to all upstream nodes of the parent
      const parentIds = getUpstreamNodeIds((node as any).parentId, edges);
      return parentIds.map((id) => {
        const n = nodes.find((nd) => nd.id === id);
        return n?.data?.label || n?.data?.type || id;
      }).filter(Boolean);
    }
    const upstreamIds = getUpstreamNodeIds(node.id, edges);
    const names = new Set<string>();
    for (const upId of upstreamIds) {
      const upNode = nodes.find((n) => n.id === upId);
      if (!upNode) continue;
      names.add(upNode.data?.label || upNode.data?.type || upId);
    }
    return Array.from(names);
  }, [node.id, (node as any).parentId, edges, nodes]);

  const configInputFields: string[] = node.data.config?.inputFields || [];
  const isChatFlow = nodes.some((n: any) => n.data?.config?.triggerType === 'chat');

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
    <Dialog.Root open={!!node} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" onClick={() => onClose()} />
        <Dialog.Content className="fixed z-50 top-12 left-1/2 -translate-x-1/2 bg-surface rounded-lg shadow-m3-4 w-full max-w-2xl max-h-[80vh] mx-4 flex flex-col overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider bg-surface-container-high px-2 py-0.5 rounded">
              {NODE_LABELS[node.data.type] || node.data.type}
            </span>
            <TextField
              label="Node name"
              value={node.data.label || ''}
              onChange={(v) => onLabelChange(v)}
              error={labelError}
              className="w-48"
            />
          </div>
          <div className="flex items-center gap-1">
            {node.data.type !== 'trigger' && (
              <Tooltip content="Delete node">
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors"
                >
                  <Icon name="delete" className="text-base" /> Delete
                </button>
              </Tooltip>
            )}
            <Dialog.Close className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors cursor-pointer">
              <span className="flex items-center gap-1 text-xs">
                <Icon name="close" className="text-base" /> Close
              </span>
            </Dialog.Close>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Input Field Selection ── */}
          {upstreamLabels.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                {node.data.type === 'output' ? 'Select Output Fields' : 'Select Input Nodes'}
              </h4>
              <div className="flex items-center justify-end mb-1">
                <button
                  type="button"
                  onClick={() => onConfigChange({ inputFields: [] })}
                  disabled={configInputFields.length === 0}
                  className="text-[10px] text-primary hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
                >Select none</button>
              </div>
              <div className="bg-surface border border-outline-variant rounded p-2 space-y-1">
                  {upstreamLabels.map((label) => {
                    const upNode = nodes.find(n => (n.data?.label || n.data?.type || n.id) === label);
                    const allFields = upNode ? getNodeFields(upNode) : [];
                    const fields = upNode ? getNodeFields(upNode) : [];
                  const labelSelected = configInputFields.includes(label);
                  return (
                    <div key={label}>
                      <label className="flex items-center gap-2 cursor-pointer hover:bg-surface-container rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={labelSelected}
                          onChange={() => toggleField(label)}
                          className="w-3 h-3 accent-primary"
                        />
                        <span className="text-xs font-semibold text-on-surface">{label}</span>
                        <span className="text-[10px] text-on-surface-variant">({fields.length} fields)</span>
                      </label>
                      {fields.length > 0 && (
                        <div className="ml-5 pl-3 border-l border-outline-variant space-y-0.5 mb-1">
                          {fields.map((f) => {
                            const fp = `${label}.${f.name}`;
                            const checked = labelSelected || configInputFields.includes(fp);
                            return (
                              <label key={fp} className="flex items-center gap-2 cursor-pointer hover:bg-surface-container rounded px-1 py-0.5">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleField(fp)}
                                  className="w-2.5 h-2.5 accent-primary"
                                />
                                <span className="text-[10px] font-mono text-on-surface-variant">{f.name}</span>
                                <span className="text-[9px] text-outline-variant">: {f.type}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {configInputFields.length === 0 && upstreamLabels.length > 0 && (
                  <p className="text-[10px] text-on-surface-variant italic pt-1 border-t border-surface-container-high mt-1">
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
                <span className="text-xs font-medium text-on-surface-variant">Condition Expression</span>
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
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  Type &#x7B;&#x7B; to reference upstream data as &#x7B;&#x7B;input.Label.field&#x7D;&#x7D;.
                </p>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-on-surface-variant block mb-1">Output Labels</span>
                <div className="space-y-1.5">
                  {(node.data.config.outputLabels || ['true', 'false']).map((label: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className="flex-1 rounded border border-outline p-2 text-sm"
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
                        className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors"
                      ><Icon name="close" className="text-sm" /></button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const list = [...(node.data.config.outputLabels || ['true', 'false'])];
                      onConfigChange({ outputLabels: [...list, ''] });
                    }}
                    className="text-sm text-primary hover:underline block"
                  >+ Add label</button>
                </div>
              </label>
              <div className="mt-3">
                <SelectField
                  label="Default path"
                  value={node.data.config.defaultPath || ''}
                  onChange={(v) => onConfigChange({ defaultPath: v })}
                  options={[
                    { value: '', label: 'None (skip on no match)' },
                    ...(node.data.config.outputLabels || ['true', 'false'])
                      .filter((l: string) => l.trim())
                      .map((l: string) => ({ value: l, label: l })),
                  ]}
                  helpText="When no condition matches, route here instead of skipping."
                />
              </div>
            </div>
          )}

          {node.data.type === 'code' && (
            <div className="space-y-3">
              <TextField
                label="JavaScript Code"
                value={node.data.config.code || ''}
                onChange={(v) => onConfigChange({ code: v })}
                multiline
                rows={6}
                helpText='Use "input" to access upstream data. Return the transformed value.'
                className="font-mono"
              />
              <div>
                <p className="text-xs font-medium text-on-surface-variant mb-1">Output Structure <span className="text-on-surface-variant">(documentation)</span></p>
                <textarea
                  value={node.data.config.outputSchema || ''}
                  onChange={(e) => onConfigChange({ outputSchema: e.target.value })}
                  placeholder='{"type":"object","properties":{"result":{"type":"string"}},"required":["result"]}'
                  rows={Math.max(2, Math.min(8, (node.data.config.outputSchema || '').split('\n').length))}
                  className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary max-h-[160px]"
                />
                <p className="mt-1 text-[10px] text-on-surface-variant">Optional. Documents what this node outputs so downstream nodes can reference the structure.</p>
              </div>
            </div>
          )}

          {node.data.type === 'retriever' && (
            <RetrieverConfig config={node.data.config} onChange={onConfigChange} />
          )}

          {node.data.type === 'trigger' && (
            <div className="space-y-3">
              <SelectField
                label="Trigger Type"
                value={node.data.config.triggerType || 'manual'}
                onChange={(v) => onConfigChange({ triggerType: v })}
                options={[
                  { value: 'manual', label: 'Manual' },
                  { value: 'chat', label: 'Chat' },
                  { value: 'webhook', label: 'Webhook' },
                  { value: 'schedule', label: 'Schedule' },
                ]}
              />

              {node.data.config.triggerType === 'webhook' && (
                <>
                  <TextField
                    label="Webhook Secret"
                    value={node.data.config.webhookSecret || ''}
                    onChange={(v) => onConfigChange({ webhookSecret: v })}
                    helpText="Pass as ?secret=... in the webhook URL"
                  />
                  <div className="bg-surface-container rounded p-2">
                    <p className="text-[10px] font-medium text-on-surface-variant mb-1">Webhook URL</p>
                    <code className="text-[10px] text-on-surface-variant break-all">
                      {process.env.NEXT_PUBLIC_API_URL || '/api'}/webhook/
                      {flowId}
                      {node.data.config.webhookSecret ? '?secret=••••••••' : ''}
                    </code>
                  </div>
                </>
              )}

              {node.data.config.triggerType === 'schedule' && (
                <TextField
                  label="Cron Expression"
                  value={node.data.config.cronExpression || ''}
                  onChange={(v) => onConfigChange({ cronExpression: v })}
                  helpText="minute hour day-of-month month day-of-week. E.g. &quot;0 9 * * *&quot; = daily at 9am, &quot;*/15 * * * *&quot; = every 15 min"
                />
              )}

              {(node.data.config.triggerType === 'schedule' ||
                node.data.config.triggerType === 'manual') && (
                <TextField
                  label="Input Message"
                  value={node.data.config.inputMessage || ''}
                  onChange={(v) => onConfigChange({ inputMessage: v })}
                  multiline
                  rows={2}
                  helpText="Sent to the next node each trigger. Plain text becomes the message, JSON objects are passed as structured input."
                />
              )}

              {node.data.config.triggerType === 'webhook' && (
                <div>
                  <p className="text-xs font-medium text-on-surface-variant mb-1">Expected Input Schema</p>
                  <textarea
                    value={node.data.config.inputSchema || ''}
                    onChange={(e) => onConfigChange({ inputSchema: e.target.value })}
                    placeholder='{"type":"object","properties":{...}}'
                    rows={Math.max(3, Math.min(10, (node.data.config.inputSchema || '').split('\n').length))}
                    className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary max-h-[200px]"
                  />
                  <p className="mt-1 text-[10px] text-on-surface-variant">Define required fields and types. Incoming POSTs are validated — invalid requests get 400.</p>
                </div>
              )}
            </div>
          )}

          {node.data.type === 'output' && (
            <div className="space-y-3">
              {isChatFlow ? (
                <div className="text-xs text-on-surface-variant bg-surface-container rounded border p-2">
                  <p className="font-medium text-on-surface-variant mb-1">Chat output</p>
                  <p className="text-[10px] text-on-surface-variant">
                    Chat flows automatically stream responses to the chat window. Select <strong>exactly one field</strong>
                    from the upstream node (above) to return as the plain text response.
                    Multi-field or no-field selection is not allowed for chat flows.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-on-surface-variant bg-surface-container rounded border p-2">
                  <p className="font-medium text-on-surface-variant mb-1">Output behavior</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>No fields selected → all accumulated data (JSON)</li>
                    <li>One field selected → just the field value</li>
                    <li>Multiple fields selected → combined as JSON object</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {node.data.type === 'parallel' && (
            <div className="space-y-3">
              <p className="text-xs text-on-surface-variant">
                Drag LLM Agent nodes from the catalog onto the canvas and drop them inside the Parallel
                container. They will run concurrently with the same input and their outputs will be
                merged.
              </p>
              <p className="text-[10px] text-on-surface-variant">
                Tip: Drag an existing LLM Agent node into the dashed area to add it. Drag it out to remove it.
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
            <pre className="text-xs bg-surface-container p-3 rounded overflow-auto">
              {JSON.stringify(node.data.config, null, 2)}
            </pre>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
  );
}
