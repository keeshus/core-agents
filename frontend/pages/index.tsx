import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '@/lib/api-client';
import { useAuth, useAuthConfig } from '@/lib/auth-context';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { Tooltip } from '@/components/ui/Tooltip';

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
      const flow = await api.flows.create({
        name: 'New Flow',
        description: '',
        nodes: [{
          id: `node_${Date.now()}_trigger`,
          type: 'trigger',
          position: { x: 100, y: 200 },
          data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual', inputSchema: '' } },
        }],
      });
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
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Core Agents</h1>
            {!isReader && <p className="text-sm text-on-surface-variant mt-1">Build and manage your LLM agent workflows</p>}
          </div>
          <div className="flex items-center gap-2">
            {authLoading ? null : user ? (
              <>
                <span className="text-xs text-on-surface-variant mr-1">{user.name}</span>
                <Tooltip content="Profile">
                  <Link href="/profile" className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                    <Icon name="person" className="text-sm" /> Profile
                  </Link>
                </Tooltip>
                {can('execution:approve') && (
                  <Tooltip content="All pending approvals">
                    <Link href="/approvals" className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                      <Icon name="thumb_up" className="text-base" /> Approvals
                    </Link>
                  </Tooltip>
                )}
                {can('admin') && (
                <Tooltip content="Settings">
                  <Link href="/settings" className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                    <Icon name="settings" className="text-sm" /> Settings
                  </Link>
                </Tooltip>
                )}
                <Tooltip content="Sign Out">
                  <button onClick={handleLogout} className="flex items-center gap-1 p-2 text-xs text-on-surface-variant hover:text-error transition-colors">
                    <Icon name="logout" className="text-xl" /> Sign Out
                  </button>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip content="Sign In">
                  <Link href="/login" className="flex items-center gap-1 px-3 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
                    <Icon name="login" className="text-base" /> Sign In
                  </Link>
                </Tooltip>
                <Tooltip content="Create Account">
                  <Link href="/register" className="m3-button">
                    <Icon name="person_add" className="text-base" /> Register
                  </Link>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {authLoading ? (
          <div className="flex items-center justify-center py-16">
            <Icon name="sync" className="text-2xl text-on-surface-variant animate-spin" />
          </div>
        ) : !user ? (
          <div className="text-center py-16 bg-surface rounded-xl border max-w-lg mx-auto">
            <h2 className="text-xl font-bold text-on-surface mb-2">Welcome to Core Agents</h2>
            <p className="text-sm text-on-surface-variant mb-6">Build and manage your LLM agent workflows with a visual drag-and-drop editor.</p>
          </div>
        ) : loading ? (
          <p className="text-on-surface-variant text-sm">Loading...</p>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <TextField label="Search" value={search} onChange={(v) => { setSearch(v); setPage(0); }} className="flex-1" />
              <SelectField
                label="Sort"
                value={sort}
                onChange={(v) => { setSort(v as 'updated_at' | 'created_at'); setPage(0); }}
                options={[
                  { value: 'updated_at', label: 'Last updated' },
                  { value: 'created_at', label: 'Created' },
                ]}
              />
              {can('flow:create') && (
                <button onClick={handleCreate} className="m3-button gap-2 shrink-0">
                  <Icon name="add" className="text-base" /> New Flow
                </button>
              )}
            </div>
            {flows.length === 0 ? (
              <div className="text-center py-16 bg-surface rounded-xl border">
                <p className="text-on-surface-variant mb-2">{search ? 'No flows match your search' : 'No flows yet'}</p>
                {can('flow:create') && !search && (
                  <button onClick={handleCreate} className="text-primary hover:text-primary text-sm font-medium">Create your first flow</button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
            {flows.map((flow) => (
              <div key={flow.id} className="bg-surface rounded-lg border p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                <div>
                  <Link href={`/flows/${flow.id}/edit`} className="font-medium text-on-surface hover:text-primary">{flow.name}</Link>
                  <p className="text-xs text-on-surface-variant mt-0.5">{flow.description || 'No description'}</p>
                  <p className="text-[10px] text-on-surface-variant mt-1">{new Date(flow.updated_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const triggerNode = flow.nodes?.find((n: any) => n.data?.type === 'trigger');
                    const triggerType = triggerNode?.data?.config?.triggerType || 'manual';
                    const isChat = triggerType === 'chat';
                    return (
                      <>
                    {isChat ? (
                      <Tooltip content="Chat with this agent">
                        <Link href={`/chat/${flow.id}`} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-success hover:bg-secondary-container rounded transition-colors">
                          <Icon name="chat" className="text-sm" /> Chat
                        </Link>
                      </Tooltip>
                    ) : (
                      running[flow.id] === 'running' ? (
                        <Tooltip content="Running...">
                          <span className="flex items-center gap-1 px-2 py-1 text-xs text-primary bg-primary-container rounded"><Icon name="sync" className="text-sm animate-spin" /> Running</span>
                        </Tooltip>
                      ) : running[flow.id] === 'ok' ? (
                        <Tooltip content="Completed">
                          <span className="flex items-center gap-1 px-2 py-1 text-xs text-success bg-success-container rounded"><Icon name="check_circle" className="text-sm" /> Completed</span>
                        </Tooltip>
                      ) : running[flow.id] === 'error' ? (
                        <Tooltip content="Failed">
                          <span className="flex items-center gap-1 px-2 py-1 text-xs text-error bg-error-container rounded"><Icon name="cancel" className="text-sm" /> Failed</span>
                        </Tooltip>
                    ) : (
                      <Tooltip content="Run flow">
                        <button onClick={() => handleRun(flow.id)} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors cursor-pointer">
                          <Icon name="play_arrow" className="text-sm" /> Run
                        </button>
                      </Tooltip>
                    ))}
                    {can('execution:approve') && !isChat && (
                      <Tooltip content="Executions">
                        <Link href={`/flows/${flow.id}/executions`} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                          <Icon name="history" className="text-sm" /> Run history
                        </Link>
                      </Tooltip>
                    )}
                      </>
                    );
                  })()}
                  {can('flow:edit') && (
                    <Tooltip content="Edit flow">
                      <Link href={`/flows/${flow.id}/edit`} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                        <Icon name="edit" className="text-sm" /> Edit
                      </Link>
                    </Tooltip>
                  )}
                  {can('flow:delete') && (
                    <Tooltip content="Delete flow">
                      <button onClick={() => handleDelete(flow.id)} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors cursor-pointer">
                        <Icon name="delete" className="text-sm" /> Delete
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
                </div>
                <div className="flex items-center justify-between mt-4 text-sm">
                  <span className="text-on-surface-variant">{total} flow{total !== 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-2">
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="m3-button-outlined text-sm disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
                    <span className="text-on-surface-variant text-xs">Page {page + 1} of {Math.ceil(total / PAGE_SIZE) || 1}</span>
                    <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="m3-button-outlined text-sm disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
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
