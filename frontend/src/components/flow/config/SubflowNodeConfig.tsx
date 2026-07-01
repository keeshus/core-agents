import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { TemplateAutocomplete } from '@/components/flow/config/TemplateAutocomplete';
import { Icon } from '@/components/ui/Icon';

interface SubflowNodeConfigProps {
  config: { subflowId: string; inputMapping: Record<string, string> };
  onChange: (updates: Record<string, any>) => void;
  nodeId: string;
  nodes: any[];
  edges: any[];
}

function parseSchema(schemaStr: string): { properties: Record<string, any>; required: string[] } {
  try {
    const schema = JSON.parse(schemaStr);
    return {
      properties: schema.properties || {},
      required: Array.isArray(schema.required) ? schema.required : [],
    };
  } catch {
    return { properties: {}, required: [] };
  }
}

function getSubflowInputSchema(subflow: any): { properties: Record<string, any>; required: string[]; inputMessage?: string } {
  const nodes = subflow.nodes || [];
  const triggerNode = nodes.find((n: any) => n.data?.type === 'trigger');
  if (!triggerNode) return { properties: {}, required: [] };
  const triggerConfig = triggerNode.data?.config || {};
  const schemaStr = triggerConfig.inputSchema || '';
  return { ...parseSchema(schemaStr), inputMessage: triggerConfig.inputMessage || '' };
}

export function SubflowNodeConfig({ config, onChange, nodeId, nodes, edges }: SubflowNodeConfigProps) {
  const [subflows, setSubflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.flows.list({ is_subflow: true }).then((res) => {
      setSubflows(res.data || []);
    }).catch(() => {
      setSubflows([]);
    }).finally(() => setLoading(false));
  }, []);

  const selectedSubflow = subflows.find((s) => s.id === config.subflowId);

  const schemaInfo = useMemo(() => {
    if (!selectedSubflow) return { properties: {}, required: [] };
    return getSubflowInputSchema(selectedSubflow);
  }, [selectedSubflow]);

  const inputMapping = config.inputMapping || {};

  const setInputMapping = (field: string, value: string) => {
    onChange({ inputMapping: { ...inputMapping, [field]: value } });
  };

  const propertyKeys = Object.keys(schemaInfo.properties);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
          Select Subflow
        </h4>
        {loading ? (
          <p className="text-xs text-on-surface-variant">Loading subflows...</p>
        ) : subflows.length === 0 ? (
          <div className="bg-surface-container rounded border p-3 text-xs text-on-surface-variant">
            <p>No subflows found. Create a flow and mark it as a subflow in its settings.</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {subflows.map((sf) => {
              const isSelected = sf.id === config.subflowId;
              const inputSchema = getSubflowInputSchema(sf);
              const fieldCount = Object.keys(inputSchema.properties).length;
              return (
                <button
                  key={sf.id}
                  type="button"
                  onClick={() => onChange({ subflowId: sf.id, subflowName: sf.name, inputMapping: {} })}
                  className={`w-full text-left p-2 rounded border text-xs transition-colors ${
                    isSelected
                      ? 'bg-secondary-container border-secondary text-on-secondary-container'
                      : 'bg-surface border-outline-variant text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{sf.name}</span>
                    {fieldCount > 0 && (
                      <span className="text-[9px] text-on-surface-variant shrink-0 ml-2">{fieldCount} field{fieldCount !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {(() => {
                    const desc = sf.description || getSubflowInputSchema(sf).inputMessage;
                    return desc ? (
                      <p className="text-[10px] text-on-surface-variant truncate mt-0.5">{desc}</p>
                    ) : null;
                  })()}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedSubflow && propertyKeys.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
            Input Mapping
          </h4>
          <p className="text-[10px] text-on-surface-variant mb-2">
            Map each subflow input field to an upstream variable. Type {'{{'} to reference upstream data.
          </p>
          <div className="space-y-2">
            {propertyKeys.map((field) => {
              const prop = schemaInfo.properties[field];
              const isRequired = schemaInfo.required.includes(field);
              const propType = prop?.type || 'any';
              return (
                <div key={field} className="bg-surface border border-outline-variant rounded p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <code className="text-xs font-mono text-on-surface">{field}</code>
                    <span className="text-[9px] text-on-surface-variant">: {propType}</span>
                    {isRequired && (
                      <span className="text-[9px] text-error ml-auto">required</span>
                    )}
                  </div>
                  {prop?.description && (
                    <p className="text-[10px] text-on-surface-variant mb-1">{prop.description}</p>
                  )}
                  <TemplateAutocomplete
                    value={inputMapping[field] || ''}
                    onChange={(v) => setInputMapping(field, v)}
                    placeholder={'{{input.Label.' + field + '}}'}
                    rows={1}
                    nodeId={nodeId}
                    nodes={nodes}
                    edges={edges}
                    className="min-h-[32px]"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedSubflow && propertyKeys.length === 0 && (
        <div className="bg-surface-container rounded border p-3 text-xs text-on-surface-variant">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="info" className="text-sm" />
            <span className="font-medium">No input fields</span>
          </div>
          <p>This subflow does not define any input fields. No mapping is required.</p>
        </div>
      )}
    </div>
  );
}
