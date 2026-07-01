import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';

const NODE_ICONS: Record<string, string> = {
  trigger: 'arrow_forward',
  'llm-agent': 'smart_toy',
  'mcp-tool': 'build',
  retriever: 'search',
  branch: 'call_split',
  code: 'code',
  parallel: 'view_column',
  hitl: 'schedule',
  output: 'check_circle',
};

interface NodeCatalogProps {
  onAddNode: (type: string, defaultConfig: Record<string, any>) => void;
  onClose?: () => void;
  disabledTypes?: string[];
  disabledReasons?: Record<string, string>;
}

export function NodeCatalog({ onAddNode, onClose, disabledTypes = [], disabledReasons = {} }: NodeCatalogProps) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.catalog.list().then(setCatalog).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-surface/95 backdrop-blur border rounded-xl shadow-m3-4 p-3 space-y-3 w-56">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Add Node</h3>
        </div>
        <p className="text-xs text-on-surface-variant px-1">Loading...</p>
      </div>
    );
  }

  const categories = ['input', 'processing', 'tools', 'output'] as const;
  const CATEGORY_LABELS: Record<string, string> = { input: 'Input', processing: 'Processing', tools: 'Tools', output: 'Output' };

  return (
    <div className="bg-surface/95 backdrop-blur border rounded-xl shadow-m3-4 p-3 space-y-3 w-56">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Add Node</h3>
        {onClose && (
          <button onClick={onClose} className="flex items-center gap-1 p-0.5 text-outline-variant hover:text-error hover:bg-error-container rounded transition-colors">
            <Icon name="close" className="text-xs" /> Close
          </button>
        )}
      </div>
      {categories.map((cat) => {
        const items = catalog.filter((e) => e.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <p className="text-[9px] uppercase tracking-wider text-outline-variant mb-1 px-1">{CATEGORY_LABELS[cat]}</p>
            <div className="flex flex-wrap gap-1">
              {items.map((entry) => {
                const iconName = NODE_ICONS[entry.type] || 'extension';
                  const isDisabled = disabledTypes.includes(entry.type);
                  const tooltipContent = isDisabled && disabledReasons[entry.type] ? disabledReasons[entry.type] : entry.description;
                  return (
                    <Tooltip content={tooltipContent}>
                      <button
                        key={entry.type}
                        disabled={isDisabled}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-xs font-medium ${isDisabled ? 'text-outline-variant cursor-not-allowed' : 'hover:bg-surface-container-high text-on-surface-variant cursor-pointer'}`}
                        onClick={() => { if (!isDisabled) onAddNode(entry.type, entry.defaultConfig); }}
                      >
                        <Icon name={iconName} className={`text-sm ${isDisabled ? 'text-outline-variant' : 'text-on-surface-variant'}`} />
                        {entry.label}
                      </button>
                    </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
