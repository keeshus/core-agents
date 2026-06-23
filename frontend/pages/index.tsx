import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '@/lib/api-client';
import { useAuth, useAuthConfig } from '@/lib/auth-context';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import Link from 'next/link';
import { Plus, Trash2, Edit3, MessageCircle, Settings, Play, Loader2, CheckCircle, XCircle, History, Bug, LogIn, UserPlus, LogOut, User, ThumbsUp } from 'lucide-react';

export default function FlowsListPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const authConfig = useAuthConfig();
  const [flows, setFlows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'updated_at' | 'created_at'>('updated_at');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, 'running' | 'ok' | 'error' | null>>({});
  const PAGE_SIZE = 20;
  const router = useRouter();

  useAssistantContext({ pageKey: 'flows-list', description: 'Viewing all flows' });
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const isReader = user && !can('flow:create');

  // Readers go straight to the approvals page
  useEffect(() => {
    if (authLoading) return;
    if (isReader) { router.replace('/approvals'); return; }
    if (!user) {
      // Check if first-time setup is needed
      fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/auth/setup-status`)
        .then(r => r.json())
        .then(data => { if (data.required) router.replace('/setup'); })
        .catch(() => {});
    }
  }, [authLoading, isReader, user, router]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user || isReader) {
      setLoading(false);
      return;
    }
    api.flows.list({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, search: search || undefined, sort }).then(({ data, total }) => { setFlows(data || []); setTotal(total || 0); }).catch(() => { setFlows([]); setTotal(0); }).finally(() => setLoading(false));
  }, [user, authLoading, isReader, page, search, sort]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleCreate = async () => {
    try {
      const flow = await api.flows.create({ name: 'New Flow', description: '' });
      router.push(`/flows/${flow.id}/edit`);
    } catch (err) {
      console.error('Failed to create flow:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this flow?')) return;
    await api.flows.delete(id);
    setFlows(flows.filter(f => f.id !== id));
  };

  const handleRun = async (flowId: string) => {
    setRunning((prev) => ({ ...prev, [flowId]: 'running' }));
    try {
      // Use the trigger node's configured input if available
      const flow = flows.find(f => f.id === flowId);
      const triggerNode = flow?.nodes?.find((n: any) => n.data?.type === 'trigger');
      const inputMessage = triggerNode?.data?.config?.inputMessage || '';
      let input: any;
      try { input = inputMessage ? JSON.parse(inputMessage) : { message: inputMessage || 'Hello!' }; }
      catch { input = { message: inputMessage || 'Hello!' }; }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      await api.flows.execute(flowId, input, controller.signal);
      clearTimeout(timeout);
      setRunning((prev) => ({ ...prev, [flowId]: 'ok' }));
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setRunning((prev) => ({ ...prev, [flowId]: 'error' }));
      } else {
        setRunning((prev) => ({ ...prev, [flowId]: null }));
      }
    }
    setTimeout(() => setRunning((prev) => ({ ...prev, [flowId]: null })), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Core Agents</h1>
            {!isReader && <p className="text-sm text-gray-500 mt-1">Build and manage your LLM agent workflows</p>}
          </div>
          <div className="flex items-center gap-2">
            {authLoading ? null : user ? (
              <>
                <span className="text-xs text-gray-500 mr-1">{user.name}</span>
                <Link href="/profile" className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Profile">
                  <User className="w-5 h-5" />
                </Link>
                {can('execution:approve') && (
                  <Link href="/approvals" className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="All pending approvals">
                    <ThumbsUp className="w-4 h-4" /> Approvals
                  </Link>
                )}
                {can('admin') && (
                  <Link href="/settings" className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Settings">
                    <Settings className="w-5 h-5" />
                  </Link>
                )}
                {can('flow:create') && (
                  <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                    <Plus className="w-4 h-4" /> New Flow
                  </button>
                )}
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Sign Out">
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors" title="Sign In">
                  <LogIn className="w-4 h-4" /> Sign In
                </Link>
                <Link href="/register" className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors" title="Create Account">
                  <UserPlus className="w-4 h-4" /> Register
                </Link>
              </>
            )}
          </div>
        </div>

        {authLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : !user ? (
          <div className="text-center py-16 bg-white rounded-xl border max-w-lg mx-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome to Core Agents</h2>
            <p className="text-sm text-gray-500 mb-6">Build and manage your LLM agent workflows with a visual drag-and-drop editor.</p>
          </div>
        ) : loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search flows by name or description..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <select
                value={sort}
                onChange={e => { setSort(e.target.value as any); setPage(0); }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
              >
                <option value="updated_at">Last updated</option>
                <option value="created_at">Created</option>
              </select>
            </div>
            {flows.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border">
                <p className="text-gray-400 mb-2">{search ? 'No flows match your search' : 'No flows yet'}</p>
                {can('flow:create') && !search && (
                  <button onClick={handleCreate} className="text-blue-600 hover:text-blue-700 text-sm font-medium">Create your first flow</button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
            {flows.map((flow) => (
              <div key={flow.id} className="bg-white rounded-lg border p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                <div>
                  <Link href={`/flows/${flow.id}/edit`} className="font-medium text-gray-900 hover:text-blue-600">{flow.name}</Link>
                  <p className="text-xs text-gray-500 mt-0.5">{flow.description || 'No description'}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{new Date(flow.updated_at).toLocaleDateString()}</p>
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
                  {can('flow:edit') && (
                    <Link href={`/flows/${flow.id}/edit?debug=1`} className="p-2 text-gray-400 hover:text-purple-600 transition-colors" title="Debug this flow">
                      <Bug className="w-4 h-4" />
                    </Link>
                  )}
                  {can('execution:approve') && (
                    <Link href={`/flows/${flow.id}/executions`} className="p-2 text-gray-400 hover:text-purple-600 transition-colors" title="Executions">
                      <History className="w-4 h-4" />
                    </Link>
                  )}
                  {can('flow:edit') && (
                    <Link href={`/flows/${flow.id}/edit`} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Edit flow">
                      <Edit3 className="w-4 h-4" />
                    </Link>
                  )}
                  {can('flow:delete') && (
                    <button onClick={() => handleDelete(flow.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Delete flow">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
                </div>
                <div className="flex items-center justify-between mt-4 text-sm">
                  <span className="text-gray-500">{total} flow{total !== 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-2">
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded border text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                    <span className="text-gray-500">Page {page + 1} of {Math.ceil(total / PAGE_SIZE) || 1}</span>
                    <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded border text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
