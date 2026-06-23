import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { TemplateAutocomplete } from './TemplateAutocomplete';

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  litellm: 'LiteLLM',
};

interface LLMAgentConfigProps {
  config: {
    endpointId: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    responseFormat: 'text' | 'json_object';
    outputSchema?: string;
  };
  onChange: (config: any) => void;
  suggestions?: { upstreamLabels: string[]; nodes: any[]; edges: any[]; nodeId: string };
}

export function LLMAgentConfig({ config, onChange, suggestions }: LLMAgentConfigProps) {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<any>(null);

  useEffect(() => {
    api.llmEndpoints.list().then(setEndpoints).catch(() => {});
  }, []);

  useEffect(() => {
    const ep = endpoints.find((e: any) => e.id === config.endpointId);
    setSelectedEndpoint(ep || null);
  }, [config.endpointId, endpoints]);

  const handleEndpointChange = (endpointId: string) => {
    const ep = endpoints.find((e: any) => e.id === endpointId);
    onChange({ ...config, endpointId, endpointName: ep?.name || '', model: ep?.default_model || '' });
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-gray-700">LLM Endpoint</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
          value={config.endpointId}
          onChange={(e) => handleEndpointChange(e.target.value)}
        >
          <option value="">Select endpoint...</option>
          {endpoints.map((ep: any) => (
            <option key={ep.id} value={ep.id}>
              {ep.name} ({PROVIDER_LABELS[ep.provider_type] || ep.provider_type})
            </option>
          ))}
        </select>
        {selectedEndpoint && (
          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
            {PROVIDER_LABELS[selectedEndpoint.provider_type]}
          </span>
        )}
      </label>

      {selectedEndpoint && (
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Model</span>
          {selectedEndpoint.models?.length > 0 ? (
            <select
              className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
              value={config.model}
              onChange={(e) => onChange({ ...config, model: e.target.value })}
            >
              <option value="">Select model...</option>
              {selectedEndpoint.models.map((m: string) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
              value={config.model}
              onChange={(e) => onChange({ ...config, model: e.target.value })}
              placeholder="e.g. claude-sonnet-4-20250514"
            />
          )}
        </label>
      )}

      <label className="block">
        <span className="text-xs font-medium text-gray-700">System Prompt</span>
        <TemplateAutocomplete
          value={config.systemPrompt}
          onChange={(v) => onChange({ ...config, systemPrompt: v })}
          placeholder="You are a helpful assistant... Type {{ for field suggestions"
          rows={4}
          nodeId={suggestions?.nodeId}
          nodes={suggestions?.nodes || []}
          edges={suggestions?.edges || []}
          selectedFields={(config as any).inputFields}
        />
        <p className="mt-1 text-[10px] text-gray-400">Use {'{{'}input.Label.field{'}}'} to reference upstream data.</p>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Temperature: {config.temperature}</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            className="mt-1 block w-full"
            value={config.temperature}
            onChange={(e) =>
              onChange({ ...config, temperature: parseFloat(e.target.value) })
            }
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Max Tokens</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
            value={config.maxTokens}
            onChange={(e) =>
              onChange({ ...config, maxTokens: parseInt(e.target.value) || 4096 })
            }
            min={1}
            max={200000}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-gray-700">Response Format</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
          value={config.responseFormat || 'text'}
          onChange={(e) => onChange({ ...config, responseFormat: e.target.value })}
        >
          <option value="text">Plain Text</option>
          <option value="json_object">JSON</option>
        </select>
      </label>

      {config.responseFormat === 'json_object' && (
        <label className="block">
          <span className="text-xs font-medium text-gray-700">
            JSON Schema <span className="text-gray-400">(optional)</span>
          </span>
          <textarea
            className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[60px] font-mono"
            value={config.outputSchema || ''}
            onChange={(e) => onChange({ ...config, outputSchema: e.target.value })}
            placeholder='{"type":"object","properties":{"summary":{"type":"string"},"sentiment":{"type":"string"}},"required":["summary","sentiment"]}'
            rows={3}
          />
          <p className="mt-1 text-[10px] text-gray-400">Describes the expected JSON structure in the system prompt. Not all providers support strict schema enforcement.</p>
          {config.outputSchema && selectedEndpoint?.provider_type === 'openai' && (
            <p className="mt-1 text-[10px] text-amber-600">Note: OpenAI is the only provider that supports strict json_schema. Other providers will receive the schema as part of the prompt instead.</p>
          )}
          {config.outputSchema && selectedEndpoint?.provider_type !== 'openai' && selectedEndpoint && (
            <p className="mt-1 text-[10px] text-amber-600">This provider doesn't support strict json_schema. The schema will be included in the system prompt as guidance, but the API won't enforce it.</p>
          )}
        </label>
      )}
    </div>
  );
}
