import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

const TRIGGER_INFO: Record<string, { label: string; desc: string; color: string }> = {
  manual: { label: 'Manual', desc: 'Run/Debug button', color: 'bg-blue-100 text-blue-700' },
  chat: { label: 'Chat', desc: 'User message + history', color: 'bg-green-100 text-green-700' },
  webhook: { label: 'Webhook', desc: 'POST body → next node', color: 'bg-purple-100 text-purple-700' },
  schedule: { label: 'Schedule', desc: 'Cron-triggered', color: 'bg-orange-100 text-orange-700' },
};

export function TriggerNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const triggerType = config?.triggerType || 'manual';
  const info = TRIGGER_INFO[triggerType] || TRIGGER_INFO.manual;
  return (
    <BaseNode label={props.data?.label || 'Trigger'} nodeType="Trigger" category="input" selected={props.selected || false} inputs={0} outputs={1}>
      <div className="space-y-1">
        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${info.color}`}>{info.label}</span>
        <p className="text-[10px] text-gray-500">{info.desc}</p>
        {triggerType === 'webhook' && (
          <code className="block text-[9px] bg-gray-100 p-1 rounded mt-1 break-all">
            POST /api/webhook/...?secret=
          </code>
        )}
        {triggerType === 'schedule' && config?.cronExpression && (
          <code className="block text-[9px] bg-gray-100 p-1 rounded mt-1">{config.cronExpression}</code>
        )}
        {(triggerType === 'schedule' || triggerType === 'manual') && config?.scheduleInput && (
          <p className="text-[9px] text-gray-500 mt-1 truncate">Input: {config.scheduleInput.slice(0, 60)}</p>
        )}
        {triggerType === 'webhook' && config?.inputSchema && (
          <code className="block text-[9px] bg-purple-50 border border-purple-100 p-1 rounded mt-1 break-all">{config.inputSchema}</code>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700">{'{ message, ... }'}</span>
        <span className="text-[9px] text-gray-400 ml-1">→ next node</span>
      </div>
    </BaseNode>
  );
}
