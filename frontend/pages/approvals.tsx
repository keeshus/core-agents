import { useEffect, useState, useCallback } from 'react';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Clock, Loader2, ThumbsUp, AlertTriangle, User, LogOut } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

interface PendingExec {
  id: string;
  flow_id: string;
  status: string;
  input: any;
  output: any;
  pending_hitls: any[];
  created_at: string;
  flow_name?: string;
}

export default function ApprovalsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const isReader = user && !can('flow:create');
  useAssistantContext({ pageKey: 'approvals', description: 'Reviewing pending approvals' });

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };
  const [execs, setExecs] = useState<PendingExec[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/executions/pending`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const pending = await res.json();

      // Enrich with flow names
      const enriched = await Promise.all(pending.map(async (e: any) => {
        try {
          const flowRes = await fetch(`${API_URL}/flows/${e.flow_id}`, { credentials: 'include' });
          const flow = flowRes.ok ? await flowRes.json() : null;
          return { ...e, flow_name: flow?.name || e.flow_id?.slice(0, 8) };
        } catch {
          return { ...e, flow_name: e.flow_id?.slice(0, 8) };
        }
      }));
      setExecs(enriched);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    fetchPending();
    const interval = setInterval(fetchPending, 5000);
    return () => clearInterval(interval);
  }, [authLoading, fetchPending]);

  const handleAction = async (execId: string, decision: string, hitlNodeId?: string) => {
    setActing(prev => ({ ...prev, [execId]: true }));
    try {
      const fb = feedback[execId] || '';
      await fetch(`${API_URL}/executions/${execId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, feedback: fb, hitlNodeId }),
      });
      // Remove from list
      setExecs(prev => prev.filter(e => e.id !== execId));
    } catch {
      setError('Failed to process approval');
    } finally {
      setActing(prev => ({ ...prev, [execId]: false }));
    }
  };

  const handleReject = async (execId: string) => {
    setActing(prev => ({ ...prev, [execId]: true }));
    try {
      await fetch(`${API_URL}/executions/${execId}/reject`, {
        method: 'POST',
        credentials: 'include',
      });
      setExecs(prev => prev.filter(e => e.id !== execId));
    } catch {
      setError('Failed to reject');
    } finally {
      setActing(prev => ({ ...prev, [execId]: false }));
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          {!isReader && (
            <Link href="/" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
            <p className="text-sm text-gray-500 mt-1">Review and respond to Human-in-the-Loop requests</p>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <>
                <span className="text-xs text-gray-500 mr-1">{user.name}</span>
                <Link href="/profile" className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Profile">
                  <User className="w-5 h-5" />
                </Link>
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Sign Out">
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : execs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <ThumbsUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">All caught up!</p>
            <p className="text-xs text-gray-400 mt-1">No pending approvals</p>
          </div>
        ) : (
          <div className="space-y-4">
            {execs.map(exec => {
              const buttons = exec.output?._hitlButtons || [{ label: 'Approve', value: 'approved' }];
              const prompt = exec.output?._hitlPrompt || '';
              const allowFeedback = exec.output?._hitlAllowFeedback !== false;
              const isActing = acting[exec.id];

              return (
                <div key={exec.id} className="bg-white rounded-xl border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-semibold text-gray-900">{exec.flow_name || 'Flow'}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{exec.id?.slice(0, 8)}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{new Date(exec.created_at).toLocaleString()}</span>
                  </div>

                  {prompt && (
                    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm max-h-48 overflow-y-auto prose prose-sm max-w-none">
                      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{prompt}</ReactMarkdown>
                    </div>
                  )}

                  {allowFeedback && (
                    <textarea
                      value={feedback[exec.id] || ''}
                      onChange={e => setFeedback(prev => ({ ...prev, [exec.id]: e.target.value }))}
                      placeholder="Optional feedback..."
                      rows={2}
                      className="w-full mb-3 text-xs border border-gray-300 rounded p-2 resize-none"
                    />
                  )}

                  <div className="flex items-center gap-2 justify-end">
                    {buttons.map((btn: any) => (
                      <button
                        key={btn.value}
                        onClick={() => handleAction(exec.id, btn.value, exec.output?._hitlNodeId)}
                        disabled={isActing}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50 ${
                          btn.value === 'approved'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                      >
                        <CheckCircle className="w-3 h-3" /> {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isReader && (
          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-blue-600 hover:underline">← Back to flows</Link>
          </div>
        )}
      </div>
    </div>
  );
}
