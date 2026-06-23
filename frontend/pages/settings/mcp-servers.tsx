import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Server,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api-client';

interface FormState {
  name: string;
  url: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  url: '',
  enabled: true,
};

export default function MCPServersPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useAssistantContext({ pageKey: 'settings:mcp-servers', description: 'Managing MCP servers' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchServers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.mcpServers.list();
      setServers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (srv: any) => {
    setForm({
      name: srv.name,
      url: srv.url,
      enabled: srv.enabled,
    });
    setEditingId(srv.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this MCP server?')) return;
    setDeleting(id);
    try {
      await api.mcpServers.delete(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete server');
    } finally {
      setDeleting(null);
    }
  };

  const handleRefresh = async (id: string) => {
    setRefreshing(id);
    setError(null);
    try {
      const updated = await api.mcpServers.refreshTools(id);
      setServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh tools');
    } finally {
      setRefreshing(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        const updateData = {
          name: form.name,
          url: form.url,
          enabled: form.enabled,
        };
        const updated = await api.mcpServers.update(editingId, updateData);
        setServers((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
      } else {
        const created = await api.mcpServers.create({
          name: form.name,
          url: form.url,
          enabled: form.enabled,
        });
        setServers((prev) => [...prev, created]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save server');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">MCP Servers</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure Model Context Protocol servers and their available tools
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Server
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 bg-white rounded-lg border p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-gray-900">
              {editingId ? 'Edit MCP Server' : 'New MCP Server'}
            </h2>

            <label className="block">
              <span className="text-xs font-medium text-gray-700">Name</span>
              <input
                type="text"
                required
                className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My File System Server"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-700">URL</span>
              <input
                type="text"
                required
                className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="http://localhost:3002"
              />
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">Enabled</span>
            </label>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : editingId ? 'Update Server' : 'Create Server'}
              </button>
            </div>
          </form>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12 text-gray-400 text-sm">
            Loading MCP servers...
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && servers.length === 0 && (
          <div className="text-center py-16 bg-white rounded-lg border">
            <Server className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No MCP servers configured</p>
            <p className="text-gray-400 text-sm mt-1">
              Add an MCP server to connect external tools
            </p>
          </div>
        )}

        {/* Server list */}
        {!loading && servers.length > 0 && (
          <div className="space-y-2">
            {servers.map((srv) => (
              <div key={srv.id} className="bg-white rounded-lg border">
                {/* Server header row */}
                <div className="p-4 flex items-start gap-4">
                  <div className="p-2 bg-gray-50 rounded-lg">
                    <Server className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-gray-900">{srv.name}</h3>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          srv.enabled
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {srv.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 font-mono text-ellipsis overflow-hidden">
                      {srv.url}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>
                        {srv.tools.length} tool{srv.tools.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {srv.tools.length > 0 && (
                      <button
                        onClick={() => toggleExpand(srv.id)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition-colors"
                        title={expandedId === srv.id ? 'Collapse tools' : 'Expand tools'}
                      >
                        {expandedId === srv.id ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleRefresh(srv.id)}
                      disabled={refreshing === srv.id}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                      title="Refresh tools"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${refreshing === srv.id ? 'animate-spin' : ''}`}
                      />
                    </button>
                    <button
                      onClick={() => handleEdit(srv)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit server"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(srv.id)}
                      disabled={deleting === srv.id}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      title="Delete server"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expandable tools list */}
                {expandedId === srv.id && srv.tools.length > 0 && (
                  <div className="border-t bg-gray-50 rounded-b-lg">
                    <div className="px-4 py-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        Available Tools
                      </p>
                      <div className="space-y-1">
                        {srv.tools.map((tool: any) => (
                          <div
                            key={tool.name}
                            className="bg-white rounded border px-3 py-2"
                          >
                            <p className="text-sm font-medium text-gray-900">
                              {tool.name}
                            </p>
                            {tool.description && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {tool.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
