import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function StopNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const message = config?.message || 'Execution stopped';
  const status = config?.status || 'cancelled';
  return (
    <BaseNode label={(props.data?.label as string) || 'Stop'} nodeType="stop" category="processing" selected={props.selected || false} inputs={1} outputs={0}>
      <div className="space-y-1">
        <p className="text-xs text-red-600 font-medium flex items-center gap-1">⏹ Terminates execution</p>
        {message && <p className="text-xs text-gray-500 italic truncate">{message}</p>}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700">{status}</span>
      </div>
    </BaseNode>
  );
}
