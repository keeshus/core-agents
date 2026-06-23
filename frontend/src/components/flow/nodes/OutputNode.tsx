import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function OutputNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const inputFields: string[] = config?.inputFields || [];
  const mode = inputFields.length === 0 ? 'all' : inputFields.length === 1 ? 'single' : 'combined';
  const modeLabel = mode === 'all' ? 'JSON (all data)' : mode === 'single' ? 'single value' : `JSON (${inputFields.length} fields)`;
  const modeDesc = mode === 'all' ? 'Returns all accumulated data as JSON' : mode === 'single' ? 'Returns just the selected field value' : `Returns ${inputFields.length} fields as JSON`;
  return (
    <BaseNode label={(props.data?.label as string) || 'Output'} nodeType="Output" category="output" selected={props.selected || false} inputs={1} outputs={0}>
      <div className="space-y-1">
        <p className="text-xs text-gray-500">{modeDesc}</p>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-orange-100 text-orange-700">{modeLabel}</span>
        <span className="text-[9px] text-gray-400 ml-auto">→ final</span>
      </div>
    </BaseNode>
  );
}
