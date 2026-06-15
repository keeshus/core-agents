import { type NodeProps, useReactFlow, useStore } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';

export function ParallelNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  // Count children by parentId from the live node store
  const childCount = useStore((s) =>
    s.nodes.filter((n: any) => n.parentId === props.id).length
  );
  const count = childCount || (config?.subNodes || []).length;
  const w = (props as any).width || (props as any).style?.width || 320;
  const h = (props as any).height || (props as any).style?.height || 240;

  return (
    <div
      style={{ width: Number(w), height: Number(h) }}
      className={`rounded-xl border-2 border-dashed bg-purple-50/30 flex flex-col overflow-hidden ${
        props.selected ? 'border-purple-500 bg-purple-50/50 shadow-lg' : 'border-purple-300'
      }`}
    >
      <Handle type="target" position={Position.Left} id="input-0" className="!bg-purple-500" />
      <Handle type="source" position={Position.Right} id="output-0" className="!bg-purple-500" />

      <div className="px-3 py-2 border-b border-purple-200 bg-purple-100/50 shrink-0">
        <span className="text-sm font-semibold text-purple-800">{props.data?.label || 'Parallel'}</span>
        <span className="ml-2 text-[10px] text-purple-500">
          {count > 0 ? `${count} node${count !== 1 ? 's' : ''}` : 'empty'}
        </span>
      </div>

      <div className="flex-1">
        {count === 0 && (
          <p className="text-xs text-purple-400 text-center pt-16">
            Drop nodes here
          </p>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-purple-200 bg-purple-100/30 shrink-0">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-purple-200 text-purple-700">
          {'{ merged outputs }'}
        </span>
        <span className="text-[9px] text-purple-400 ml-1">→ next node</span>
      </div>
    </div>
  );
}
