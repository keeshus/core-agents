import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';
import { PasswordStrengthMeter } from '@/components/PasswordStrength';
import { TextInput } from '@/components/FormFields';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function SetupPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) { router.replace('/'); return; }
    fetch(`${API_URL}/auth/setup-status`)
      .then(r => r.json())
      .then(data => {
        if (!data.required) { router.replace('/login'); return; }
        setSetupRequired(true);
      })
      .catch(() => setError('Could not check setup status'))
      .finally(() => setChecking(false));
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Registration failed' }));
        throw new Error(err.error);
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (checking || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!setupRequired) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Core Agents</h1>
          <p className="text-sm text-gray-500 mb-6">Create the first admin account to get started.</p>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextInput label="Name" type="text" value={name} onChange={e => setName(e.target.value)} required />
            <TextInput label="Email" type="text" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
            <div>
              <TextInput label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" />
              <p className="text-[10px] text-gray-400 mt-2">Minimum 8 characters required</p>
              {password.length > 0 && <PasswordStrengthMeter password={password} />}
            </div>
            <button type="submit" disabled={loading} className="w-full bg-gray-900 text-white rounded p-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
              {loading ? 'Creating admin account...' : 'Create Admin Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
