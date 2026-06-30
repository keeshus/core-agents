import { type NodeProps, useStore } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function OutputNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const inputFields: string[] = config?.inputFields || [];
  const isChatFlow = useStore((s) =>
    s.nodes.some((n: any) => n.data?.config?.triggerType === 'chat')
  );
  const mode = inputFields.length === 0 ? 'all' : inputFields.length === 1 ? 'single' : 'combined';
  const modeLabel = mode === 'all' ? 'JSON (all data)' : mode === 'single' ? 'single value' : `JSON (${inputFields.length} fields)`;
  const modeDesc = mode === 'all' ? (isChatFlow ? 'Select one field above — chat requires a single value' : 'Returns all accumulated data as JSON')
    : mode === 'single' ? 'Returns just the selected field value'
    : `Returns ${inputFields.length} fields as JSON`;
  return (
    <BaseNode label={(props.data?.label as string) || 'Output'} nodeType="Output" category="output" selected={props.selected || false} inputs={1} outputs={0} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="space-y-1">
        <p className="text-xs text-on-surface-variant">{modeDesc}</p>
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant flex items-center gap-1">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isChatFlow ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-container text-on-tertiary-container'}`}>{modeLabel}</span>
        {isChatFlow && mode !== 'single' && (
          <span className="text-[9px] text-warning ml-1">⚠ select one field</span>
        )}
        <span className="text-[9px] text-on-surface-variant ml-auto">→ final</span>
      </div>
    </BaseNode>
  );
}
