import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function LLMAgentNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const isJson = config?.responseFormat === 'json_object';
  return (
    <BaseNode label={props.data?.label || 'LLM Agent'} nodeType="LLM Agent" category="processing" selected={props.selected || false} toolInputs={1}>
      <div className="space-y-1">
        <p><span className="text-gray-500">Endpoint:</span> {config?.endpointName || (config?.endpointId ? 'Configured' : 'Not set')}</p>
        <p><span className="text-gray-500">Model:</span> {config?.model || 'Default'}</p>
        {config?.systemPrompt && <p className="truncate text-gray-400 italic">{config.systemPrompt.slice(0, 50)}</p>}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isJson ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {isJson ? '{ json }' : '"text"'}
        </span>
        <span className="text-[9px] text-gray-400 ml-1">→ next node</span>
      </div>
    </BaseNode>
  );
}
