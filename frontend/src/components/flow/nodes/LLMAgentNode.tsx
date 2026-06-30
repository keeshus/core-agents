import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function LLMAgentNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const isJson = config?.responseFormat === 'json_object';
  return (
    <BaseNode label={(props.data?.label as string) || 'LLM Agent'} nodeType="LLM Agent" category="processing" selected={props.selected || false} toolInputs={1} warnings={props.data?._warnings as string[] | undefined} feedbackInput={!props.parentId} hideHandles={!!props.parentId}>
      <div className="space-y-1">
        <p><span className="text-on-surface-variant">Endpoint:</span> {config?.endpointName || (config?.endpointId ? 'Configured' : 'Not set')}</p>
        <p><span className="text-on-surface-variant">Model:</span> {config?.model || 'Default'}</p>
        {config?.systemPrompt && <p className="truncate text-on-surface-variant italic">{config.systemPrompt.slice(0, 50)}</p>}
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isJson ? 'bg-success-container text-success' : 'bg-primary-container text-primary'}`}>
          {isJson ? '{ json }' : '"text"'}
        </span>
        <span className="text-[9px] text-on-surface-variant ml-1">→ next node</span>
      </div>
    </BaseNode>
  );
}
