import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, CheckCircle, XCircle, User, Shield, Clock, LogIn } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const backHref = user && !can('flow:create') ? '/approvals' : '/';
  const backLabel = user && !can('flow:create') ? 'Back to approvals' : 'Back to flows';
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    api.auth.profile()
      .then(p => {
        setProfile(p);
        setName(p.name || '');
        setEmail(p.email || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const updated = await api.auth.updateProfile({ name, email });
      setProfile(updated);
      setSaveStatus('success');
      setSaveMessage('Profile updated');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: any) {
      setSaveStatus('error');
      setSaveMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href={backHref} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        </div>

        {/* Profile info */}
        <div className="bg-white rounded-xl border p-6 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{profile?.name || 'User'}</h2>
              <p className="text-sm text-gray-500">{profile?.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded border border-gray-300 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="text"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded border border-gray-300 p-2 text-sm"
              />
            </div>

            {saveStatus !== 'idle' && (
              <div className={`flex items-center gap-2 text-sm ${saveStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {saveStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {saveMessage}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Role & Permissions */}
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Role &amp; Permissions
          </h3>
          {profile?.role ? (
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 mb-3">
                {profile.role.name}
              </div>
              {profile.role.permissions && profile.role.permissions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Permissions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.role.permissions.map((p: string) => (
                      <span key={p} className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-mono">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No role assigned</p>
          )}
        </div>

        {/* Account info */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Account Details
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Provider</span>
              <span className="text-gray-900 capitalize">{profile?.provider || 'local'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Member since</span>
              <span className="text-gray-900">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Last login</span>
              <span className="text-gray-900">{profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : '—'}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href={backHref} className="text-sm text-blue-600 hover:underline">← {backLabel}</Link>
        </div>
      </div>
    </div>
  );
}
