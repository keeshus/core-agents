import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { SelectField } from '@/components/ui/SelectField';

interface MCPToolConfigProps {
  config: {
    serverId: string;
    toolName: string;
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

  return (
    <div className="space-y-3">
      <SelectField
        label="MCP Server"
        value={config.serverId}
        onChange={(v) => {
          const srv = servers.find((s: any) => s.id === v);
          onChange({ ...config, serverId: v, serverName: srv?.name || '', toolName: '' });
        }}
        options={[
          { value: '', label: 'Select server...' },
          ...servers.map((s: any) => ({ value: s.id, label: `${s.name} (${s.tools?.length || 0} tools)` })),
        ]}
      />

      {selectedServer && selectedServer.tools?.length > 0 && (
        <div>
          <SelectField
            label="Tool"
            value={config.toolName}
            onChange={(v) => onChange({ ...config, toolName: v })}
            options={[
              { value: '', label: 'Select tool...' },
              { value: '*', label: 'All tools' },
              ...selectedServer.tools.map((t: any) => ({ value: t.name, label: t.name })),
            ]}
          />
          {config.toolName === '*' && (
            <p className="mt-1 text-[10px] text-on-surface-variant">
              All {selectedServer.tools.length} tools from this server will be available to the LLM Agent.
            </p>
          )}
          {config.toolName && config.toolName !== '*' && (
            <p className="mt-1 text-[10px] text-on-surface-variant">
              {selectedServer.tools.find((t: any) => t.name === config.toolName)
                ?.description || ''}
            </p>
          )}
        </div>
      )}

      {config.toolName && (
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
