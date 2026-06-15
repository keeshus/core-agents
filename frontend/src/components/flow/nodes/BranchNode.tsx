import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function BranchNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const outputLabels = config?.outputLabels || ['true', 'false'];
  return (
    <BaseNode label={props.data?.label || 'Branch'} nodeType="Condition" category="processing" selected={props.selected || false} inputs={1} outputs={outputLabels.length} outputLabels={outputLabels}>
      <div className="space-y-1">
        <p><span className="text-gray-500">Condition:</span></p>
        <code className="block bg-gray-100 p-1.5 rounded text-[11px] font-mono mt-1 overflow-auto max-h-16">
          {config?.condition || 'No condition set'}
        </code>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">{'{ verdict, label }'}</span>
        <span className="text-[9px] text-gray-400 ml-1">→ true/false path</span>
      </div>
    </BaseNode>
  );
}
