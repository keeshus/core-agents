import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth, useAuthConfig } from '@/lib/auth-context';
import { API_URL } from '@/lib/api-client';
import { TextInput } from '@/components/FormFields';
import Link from 'next/link';
import { CheckCircle, XCircle } from 'lucide-react';
import { PasswordStrengthMeter } from '@/components/PasswordStrength';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const authConfig = useAuthConfig();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const hasSso = authConfig?.sso != null;
  const ssoName = authConfig?.sso?.name || 'SSO';

  const passwordsMatch = password === confirmPassword;
  const touchedConfirm = confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation matching server rules
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, name);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Account</h1>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}

          {hasSso && (
            <>
              <a
                href={`${API_URL}/auth/sso/login`}
                className="flex items-center justify-center gap-2 w-full border-2 border-gray-300 text-gray-700 rounded p-2.5 text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors mb-4"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13 12H3" />
                </svg>
                Register with {ssoName}
              </a>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <TextInput label="Name" type="text" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
            <TextInput label="Email" type="text" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
            <div>
              <TextInput label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
              <p className="text-[10px] text-gray-400 mt-2">Minimum 8 characters required</p>
              {password.length > 0 && <PasswordStrengthMeter password={password} />}
            </div>
            <div>
              <TextInput label="Confirm Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              {touchedConfirm && (
                <p className={`mt-1 text-xs flex items-center gap-1 ${passwordsMatch ? 'text-green-600' : 'text-red-600'}`}>
                  {passwordsMatch ? <CheckCircle className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
                  {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                </p>
              )}
            </div>
            <button type="submit" disabled={loading} className="w-full bg-gray-900 text-white rounded p-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-4 text-center">
            Already have an account? <Link href="/login" className="text-blue-600 hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
