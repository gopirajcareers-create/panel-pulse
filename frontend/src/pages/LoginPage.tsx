import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/lib/api/client';

const SSO_BASE = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

const SSO_ERROR_MESSAGES: Record<string, string> = {
  sso_denied: 'Sign-in was cancelled or denied.',
  sso_no_code: 'Sign-in did not complete. Please try again.',
  sso_token_failed: 'Failed to complete sign-in. Please try again.',
  sso_init_failed: 'SSO is not configured on the server. Contact IT support.',
  unauthorized_domain: 'Only @indium.tech accounts are allowed.',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const ssoError = searchParams.get('error');
  const errorMessage = ssoError ? (SSO_ERROR_MESSAGES[ssoError] || 'Sign-in failed. Please try again.') : '';

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0f]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-orange-600/20 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/15 blur-[100px]" />
        <div className="absolute top-[40%] left-[50%] w-[300px] h-[300px] -translate-x-1/2 rounded-full bg-orange-800/10 blur-[80px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,140,0,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,140,0,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="absolute top-6 right-8">
        <img src="/INDIUM LOGO.png" alt="Indium" className="h-8 object-contain" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Welcome to Panel Pulse AI
          </h1>
          <p className="text-base text-white/60">
            An AI Powered Panel Evaluation system
          </p>
        </div>

        {errorMessage && (
          <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-sm w-full">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {errorMessage}
          </div>
        )}

        <a
          href={`${SSO_BASE}/api/v1/auth/azure/login`}
          className="inline-flex items-center gap-3 bg-[#E8641F] hover:bg-[#D65F1A] text-white font-semibold text-base px-10 py-3.5 rounded-full shadow-lg shadow-orange-600/40 transition-all duration-200 hover:shadow-orange-600/60 hover:scale-[1.03] active:scale-[0.98]"
        >
          Sign In
        </a>
      </div>
    </div>
  );
}