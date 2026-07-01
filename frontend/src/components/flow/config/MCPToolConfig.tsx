import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { SelectField } from '@/components/ui/SelectField';

interface MCPToolConfigProps {
  config: {
    serverId: string;
    toolName: string;
    toolNames: string[];
    parameters: Record<string, any>;
  };
  onChange: (config: any) => void;
}

export function MCPToolConfig({ config, onChange }: MCPToolConfigProps) {
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<any>(null);

  useEffect(() => {
    api.mcpServers.list().then(setServers).catch(() => {});
  }, []);

  useEffect(() => {
    const srv = servers.find((s: any) => s.id === config.serverId);
    setSelectedServer(srv || null);
  }, [config.serverId, servers]);

  const toolNames: string[] = config.toolNames || [];
  const tools = selectedServer?.tools || [];
  const noneSelected = toolNames.length === 0;

  const setToolNames = useCallback((names: string[]) => {
    onChange({ ...config, toolName: '', toolNames: names });
  }, [config, onChange]);

  const toggleTool = useCallback((name: string) => {
    if (toolNames.includes(name)) {
      setToolNames(toolNames.filter(n => n !== name));
    } else {
      setToolNames([...toolNames, name]);
    }
  }, [toolNames, setToolNames]);

  const selectNone = useCallback(() => {
    setToolNames([]);
  }, [setToolNames]);

  return (
    <div className="space-y-3">
      <SelectField
        label="MCP Server"
        value={config.serverId}
        onChange={(v) => {
          const srv = servers.find((s: any) => s.id === v);
          onChange({ ...config, serverId: v, serverName: srv?.name || '', toolName: '', toolNames: [] });
        }}
        options={[
          { value: '', label: 'Select server...' },
          ...servers.map((s: any) => ({ value: s.id, label: `${s.name} (${s.tools?.length || 0} tools)` })),
        ]}
      />

      {selectedServer && tools.length > 0 && (
        <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Tools
              </span>
              <button
                type="button"
                onClick={selectNone}
                disabled={noneSelected}
                className="text-[10px] text-primary hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
              >Select none</button>
            </div>
          <div className="bg-surface border border-outline-variant rounded p-2 space-y-0.5 max-h-48 overflow-y-auto">
            {tools.map((t: any) => (
              <label key={t.name} className="flex items-center gap-2 cursor-pointer hover:bg-surface-container rounded px-1 py-0.5">
                <input
                  type="checkbox"
                  checked={toolNames.includes(t.name)}
                  onChange={() => toggleTool(t.name)}
                  className="w-3 h-3 accent-primary"
                />
                <span className="text-xs font-mono text-on-surface">{t.name}</span>
                {t.description && (
                  <span className="text-[9px] text-on-surface-variant truncate ml-auto max-w-[200px]">
                    {t.description}
                  </span>
                )}
              </label>
            ))}
          </div>
          {noneSelected && (
            <p className="text-[10px] text-on-surface-variant italic pt-1 border-t border-surface-container-high mt-1">
              None selected = all tools pass through
            </p>
          )}
        </div>
      )}

      {selectedServer && (
        <div>
          <span className="text-xs font-medium text-on-surface-variant">Parameters</span>
          <p className="text-[10px] text-on-surface-variant mt-1">
            Parameters are passed directly to the tool at execution time based on
            upstream node output.
          </p>
        </div>
      )}
    </div>
  );
}