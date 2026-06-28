import { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';

interface BaseNodeProps {
  children: React.ReactNode;
  label: string;
  nodeType: string;
  category?: string;
  selected: boolean;
  inputs?: number;
  outputs?: number;
  outputLabels?: string[];
  toolInputs?: number;
  toolOutput?: boolean;
  className?: string;
  warnings?: string[];
  feedbackInput?: boolean;
}

export function BaseNode({ children, label, nodeType, category = 'processing', selected, inputs = 1, outputs = 1, outputLabels, toolInputs = 0, toolOutput = false, className, warnings, feedbackInput }: BaseNodeProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn(
      'rounded-lg border-2 bg-surface shadow-m3-1 w-[220px] border-outline',
      selected && 'ring-2 ring-primary shadow-m3-2 border-primary',
      className
    )}>
      {/* Feedback input — positioned above the regular input */}
      {feedbackInput && (
        <Tooltip content="Feedback loop input">
          <Handle type="target" position={Position.Left} id="feedback-input" style={{ top: '25%' }} className="!bg-warning !w-3 !h-3 !border-2 !border-surface" />
        </Tooltip>
      )}
      {Array.from({ length: inputs }).map((_, i) => (
        <Tooltip key={`input-${i}`} content={`Input ${i}`}>
          <Handle type="target" position={Position.Left} id={`input-${i}`} style={{ top: '50%' }} />
        </Tooltip>
      ))}
      <div className="px-3 py-2 border-b bg-surface-container font-medium text-sm rounded-t-lg flex items-center gap-2 text-on-surface">
        <button onClick={() => setExpanded(p => !p)} className="flex items-center gap-1 flex-1 min-w-0 text-left cursor-pointer">
          <span className="truncate">{label}</span>
          {nodeType && label !== nodeType && (
            <span className="text-[10px] text-on-surface-variant font-normal shrink-0">{nodeType}</span>
          )}
        </button>
        <button onClick={() => setExpanded(p => !p)} className="text-on-surface-variant hover:text-on-surface shrink-0 cursor-pointer">
          {expanded ? <Icon name="expand_less" className="text-base" /> : <Icon name="expand_more" className="text-base" />}
        </button>
        {warnings && warnings.length > 0 && (
          <Tooltip content={warnings.join('\n')}>
            <span className="flex items-center gap-1 text-warning text-[10px] shrink-0">
              <Icon name="warning" className="text-sm" /> Warning
            </span>
          </Tooltip>
        )}
      </div>
      <div className={`p-3 text-xs ${expanded ? '' : 'overflow-hidden max-h-[72px]'}`} style={{ overflowX: 'hidden' }}>
        {children}
      </div>
      {/* Tool inputs — MCP/Retriever tools wire in here (LLM Agent) */}
      {Array.from({ length: toolInputs }).map((_, i) => (
        <Tooltip key={`tool-input-${i}`} content="Connect tools here">
          <Handle
            type="target"
            position={Position.Bottom}
            id={`tool-input-${i}`}
            style={{ left: `${((i + 1) / (toolInputs + 1)) * 100}%` }}
            className="!bg-secondary !w-3 !h-3"
          />
        </Tooltip>
      ))}
      {/* Tool output — MCP/Retriever nodes output to LLM Agent's tools input */}
      {toolOutput && (
        <Tooltip content="Connect to LLM Agent's tools input">
          <Handle
            key="tool-output"
            type="source"
            position={Position.Top}
            id="tool-output"
            className="!bg-secondary !w-3 !h-3"
          />
        </Tooltip>
      )}
      {outputLabels && outputLabels.length > 0 ? (
        outputLabels.map((lbl, i) => (
          <Tooltip key={`${outputLabels.length}-output-${i}`} content={lbl || `Output ${i}`}>
            <Handle
              type="source"
              position={Position.Right}
              id={`output-${i}`}
              style={{ top: `${((i + 1) / (outputLabels.length + 1)) * 100}%` }}
            />
          </Tooltip>
        ))
      ) : (
        Array.from({ length: outputs }).map((_, i) => (
          <Tooltip key={`${outputs}-output-${i}`} content={`Output ${i}`}>
            <Handle type="source" position={Position.Right} id={`output-${i}`} style={{ top: '50%' }} />
          </Tooltip>
        ))
      )}
    </div>
  );
}
