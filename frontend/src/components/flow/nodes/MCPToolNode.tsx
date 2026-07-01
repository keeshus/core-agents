import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function MCPToolNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  return (
    <BaseNode label={(props.data?.label as string) || 'MCP Tool'} nodeType="MCP Tool" category="tools" selected={props.selected || false} inputs={0} outputs={0} toolOutput warnings={props.data?._warnings as string[] | undefined}>
      <div className="space-y-1">
        <p><span className="text-on-surface-variant">Server:</span> {config?.serverName || 'Not set'}</p>
        <p><span className="text-on-surface-variant">Tool:</span> {config?.toolName === '*' ? 'All tools' : (config?.toolName || 'Not set')}</p>
        <p className="text-[10px] text-secondary mt-1">Connect purple dot to LLM Agent ↓</p>
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-secondary-container text-on-secondary-container">"result"</span>
        <span className="text-[9px] text-on-surface-variant ml-1">→ LLM Agent</span>
      </div>
    </BaseNode>
  );
}
