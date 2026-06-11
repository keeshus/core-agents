import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '@/lib/api-client';
import Link from 'next/link';
import { Plus, Trash2, Edit3, MessageCircle, Settings, Play, Loader2, CheckCircle, XCircle, History, Bug } from 'lucide-react';

export default function FlowsListPage() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, 'running' | 'ok' | 'error' | null>>({});
  const router = useRouter();

  useEffect(() => {
    api.flows.list().then(setFlows).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    const flow = await api.flows.create({ name: 'New Flow', description: '' });
    router.push(`/flows/${flow.id}/edit`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this flow?')) return;
    await api.flows.delete(id);
    setFlows(flows.filter(f => f.id !== id));
  };

  const handleRun = async (flowId: string) => {
    setRunning((prev) => ({ ...prev, [flowId]: 'running' }));
    try {
      await api.flows.execute(flowId, { message: 'Hello!' });
      setRunning((prev) => ({ ...prev, [flowId]: 'ok' }));
    } catch {
      setRunning((prev) => ({ ...prev, [flowId]: 'error' }));
    }
    setTimeout(() => setRunning((prev) => ({ ...prev, [flowId]: null })), 3000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flows</h1>
            <p className="text-sm text-gray-500 mt-1">Build and manage your LLM agent workflows</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Settings">
              <Settings className="w-5 h-5" />
            </Link>
            <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> New Flow
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : flows.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <p className="text-gray-400 mb-2">No flows yet</p>
            <button onClick={handleCreate} className="text-blue-600 hover:text-blue-700 text-sm font-medium">Create your first flow</button>
          </div>
        ) : (
          <div className="space-y-3">
            {flows.map((flow) => (
              <div key={flow.id} className="bg-white rounded-lg border p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                <div>
                  <Link href={`/flows/${flow.id}/edit`} className="font-medium text-gray-900 hover:text-blue-600">{flow.name}</Link>
                  <p className="text-xs text-gray-500 mt-0.5">{flow.description || 'No description'}</p>
                  <p className="text-[10px] text-gray-400 mt-1">v{flow.version} · {new Date(flow.updated_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {running[flow.id] === 'running' ? (
                    <span className="p-2 text-blue-500" title="Running..."><Loader2 className="w-4 h-4 animate-spin" /></span>
                  ) : running[flow.id] === 'ok' ? (
                    <span className="p-2 text-green-500" title="Completed"><CheckCircle className="w-4 h-4" /></span>
                  ) : running[flow.id] === 'error' ? (
                    <span className="p-2 text-red-500" title="Failed"><XCircle className="w-4 h-4" /></span>
                  ) : (
                    <button onClick={() => handleRun(flow.id)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Run flow">
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <Link href={`/chat/${flow.id}`} className="p-2 text-gray-400 hover:text-green-600 transition-colors" title="Chat with this agent">
                    <MessageCircle className="w-4 h-4" />
                  </Link>
                  <Link href={`/flows/${flow.id}/edit?debug=1`} className="p-2 text-gray-400 hover:text-purple-600 transition-colors" title="Debug this flow">
                    <Bug className="w-4 h-4" />
                  </Link>
                  <Link href={`/flows/${flow.id}/executions`} className="p-2 text-gray-400 hover:text-purple-600 transition-colors" title="Debug history">
                    <History className="w-4 h-4" />
                  </Link>
                  <Link href={`/flows/${flow.id}/edit`} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Edit flow">
                    <Edit3 className="w-4 h-4" />
                  </Link>
                  <button onClick={() => handleDelete(flow.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Delete flow">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
