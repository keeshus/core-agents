import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function BranchNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const outputLabels = config?.outputLabels || ['true', 'false'];
  return (
    <BaseNode label={(props.data?.label as string) || 'Branch'} nodeType="Condition" category="processing" selected={props.selected || false} inputs={1} outputs={outputLabels.length} outputLabels={outputLabels} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="space-y-1">
        <p><span className="text-on-surface-variant">Condition:</span></p>
        <code className="block bg-surface-container p-1.5 rounded text-[11px] font-mono mt-1 overflow-auto max-h-16">
          {config?.condition || 'No condition set'}
        </code>
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-secondary-container text-on-secondary-container">{'{ verdict, label }'}</span>
        <span className="text-[9px] text-on-surface-variant ml-1">→ {outputLabels.map((l: string) => l || '?').join(', ') || 'no labels'}</span>
      </div>
    </BaseNode>
  );
}
