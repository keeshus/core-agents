import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  input: 'border-green-400',
  processing: 'border-blue-400',
  tools: 'border-purple-400',
  output: 'border-orange-400',
};

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
}

export function BaseNode({ children, label, nodeType, category = 'processing', selected, inputs = 1, outputs = 1, outputLabels, toolInputs = 0, toolOutput = false, className }: BaseNodeProps) {
  const borderColor = CATEGORY_COLORS[category] || 'border-gray-300';

  return (
    <div className={cn(
      'rounded-lg border-2 bg-white shadow-sm min-w-[200px]',
      borderColor,
      selected && 'ring-2 ring-blue-500 shadow-md',
      className
    )}>
      {Array.from({ length: inputs }).map((_, i) => (
        <Handle key={`input-${i}`} type="target" position={Position.Left} id={`input-${i}`} title={`Input ${i}`} style={{ top: '50%' }} />
      ))}
      <div className="px-3 py-2 border-b bg-gray-50 font-medium text-sm rounded-t-lg flex items-center gap-2">
        <span>{label}</span>
        {nodeType && label !== nodeType && (
          <span className="text-[10px] text-gray-400 font-normal">{nodeType}</span>
        )}
      </div>
      <div className="p-3 text-xs">
        {children}
      </div>
      {/* Tool inputs — MCP/Retriever tools wire in here (LLM Agent) */}
      {Array.from({ length: toolInputs }).map((_, i) => (
        <Handle
          key={`tool-input-${i}`}
          type="target"
          position={Position.Bottom}
          id={`tool-input-${i}`}
          style={{ left: `${((i + 1) / (toolInputs + 1)) * 100}%` }}
          className="!bg-purple-500 !w-3 !h-3"
          title="Connect tools here"
        />
      ))}
      {/* Tool output — MCP/Retriever nodes output to LLM Agent's tools input */}
      {toolOutput && (
        <Handle
          key="tool-output"
          type="source"
          position={Position.Top}
          id="tool-output"
          className="!bg-purple-500 !w-3 !h-3"
          title="Connect to LLM Agent's tools input"
        />
      )}
      {outputLabels && outputLabels.length > 0 ? (
        outputLabels.map((lbl, i) => (
          <Handle
            key={`${outputLabels.length}-output-${i}`}
            type="source"
            position={Position.Right}
            id={`output-${i}`}
            title={lbl || `Output ${i}`}
            style={{ top: `${((i + 1) / (outputLabels.length + 1)) * 100}%` }}
          />
        ))
      ) : (
        Array.from({ length: outputs }).map((_, i) => (
          <Handle key={`${outputs}-output-${i}`} type="source" position={Position.Right} id={`output-${i}`} title={`Output ${i}`} style={{ top: '50%' }} />
        ))
      )}
    </div>
  );
}
