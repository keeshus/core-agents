import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function CodeNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const language = config?.language || 'javascript';
  const code = config?.code || '';
  return (
    <BaseNode label={props.data?.label || 'Code'} nodeType="Code" category="processing" selected={props.selected || false}>
      <div className="space-y-1">
        <p>
          <span className="inline-block bg-gray-200 text-gray-700 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase">{language}</span>
        </p>
        <code className="block bg-gray-100 p-1.5 rounded text-[11px] font-mono mt-1 overflow-auto max-h-20 whitespace-pre-wrap">
          {code ? code.slice(0, 120) + (code.length > 120 ? '...' : '') : 'No code'}
        </code>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-700">any</span>
        <span className="text-[9px] text-gray-400 ml-1">→ return value</span>
      </div>
    </BaseNode>
  );
}
