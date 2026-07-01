import { type NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Icon } from '@/components/ui/Icon';

export function SubflowNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const subflowId = config?.subflowId || '';
  const subflowName = config?.subflowName || '';
  const mappedCount = Object.keys(config?.inputMapping || {}).length;

  return (
    <BaseNode
      label={(props.data?.label as string) || 'Subflow'}
      nodeType="Subflow"
      category="processing"
      selected={props.selected || false}
      inputs={1}
      outputs={1}
      className="border-secondary bg-secondary-container/10"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon name="account_tree" className="text-sm text-secondary" />
        {subflowId ? (
          <span className="text-xs text-secondary truncate font-medium">{subflowName}</span>
        ) : (
          <span className="text-xs italic text-on-surface-variant">Not configured</span>
        )}
      </div>
      {subflowId && (
        <p className="text-[10px] text-on-surface-variant">
          {mappedCount} mapped field{mappedCount !== 1 ? 's' : ''}
        </p>
      )}
      <Handle type="target" position={Position.Left} id="input-0" className="!bg-secondary !w-2.5 !h-2.5 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} id="output-0" className="!bg-secondary !w-2.5 !h-2.5 !border-2 !border-white" />
    </BaseNode>
  );
}
