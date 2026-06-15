import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function HITLNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  return (
    <BaseNode label={props.data?.label || 'Human in the Loop'} nodeType="HITL" category="processing" selected={props.selected || false} inputs={1} outputs={1}>
      <div className="space-y-1">
        <p className="text-xs text-gray-500">Flow pauses here for human approval</p>
        {config?.prompt && <p className="text-xs text-amber-600 italic truncate">{config.prompt.slice(0, 60)}</p>}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700">⏸ pause & approve</span>
        <span className="text-[9px] text-gray-400 ml-1">→ continue on approve</span>
      </div>
    </BaseNode>
  );
}
