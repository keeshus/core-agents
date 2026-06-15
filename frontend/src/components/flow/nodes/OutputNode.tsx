import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

const FORMAT_INFO: Record<string, string> = {
  json: '{ ... } as-is',
  text: '"content" extracted',
  markdown: 'text | table',
};

export function OutputNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const format = config?.format || 'json';
  return (
    <BaseNode label={props.data?.label || 'Output'} nodeType="Output" category="output" selected={props.selected || false} inputs={1} outputs={0}>
      <div className="space-y-1">
        <p><span className="text-gray-500">Format:</span> {format}</p>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-orange-100 text-orange-700">{FORMAT_INFO[format]}</span>
        <span className="text-[9px] text-gray-400 ml-1">→ final</span>
      </div>
    </BaseNode>
  );
}
