import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, RefreshCw, CheckCircle, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import type { AuthUser } from '@/context/AuthContext';

const ALLOWED_DOMAIN = '@indium.tech';
const OTP_LENGTH = 6;
// Seconds before the user can request another code
const RESEND_COOLDOWN = 60;

type Step = 'email' | 'otp';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [testOtp, setTestOtp] = useState('');

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  // Auto-focus first OTP box when step changes
  useEffect(() => {
    if (step === 'otp') setTimeout(() => otpRefs.current[0]?.focus(), 80);
  }, [step]);

  // ── Email step ──────────────────────────────────────────────────────────────
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith(ALLOWED_DOMAIN)) {
      setError(`Only ${ALLOWED_DOMAIN} addresses are allowed.`);
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post<{ otp?: string }>('/api/v1/auth/request-otp', { email: trimmed });
      if (res.data.otp) setTestOtp(res.data.otp);
      setEmail(trimmed);
      setStep('otp');
      setResendCountdown(RESEND_COOLDOWN);
    } catch (err: any) {
      setError(
        err?.response?.data?.details ||
          err?.response?.data?.error ||
          'Failed to send code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ── OTP step ────────────────────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    // Accept only digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setError('');

    // Move focus forward on input
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    if (digit && next.every(Boolean)) {
      submitOtp(next.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otp[index]) {
        const next = [...otp];
        next[index] = '';
        setOtp(next);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  // Handle paste into OTP boxes
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!digits) return;
    const next = Array(OTP_LENGTH).fill('');
    digits.split('').forEach((d, i) => { next[i] = d; });
    setOtp(next);
    const focusIdx = Math.min(digits.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
    if (digits.length === OTP_LENGTH) submitOtp(digits);
  };

  const submitOtp = async (code: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await apiClient.post<AuthUser>('/api/v1/auth/verify-otp', { email, code });
      setUser(res.data);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(
        err?.response?.data?.error || 'Incorrect or expired code. Please try again.'
      );
      setOtp(Array(OTP_LENGTH).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    setError('');
    setOtp(Array(OTP_LENGTH).fill(''));
    setLoading(true);
    try {
      const res = await apiClient.post<{ otp?: string }>('/api/v1/auth/request-otp', { email });
      if (res.data.otp) setTestOtp(res.data.otp);
      setResendCountdown(RESEND_COOLDOWN);
    } catch (err: any) {
      setError(err?.response?.data?.details || err?.response?.data?.error || 'Failed to resend.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary mb-4 shadow-lg">
            <CheckCircle className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Panel Pulse AI</h1>
          <p className="text-sm text-text-muted mt-1">Internal tool for Indium Software</p>
          <p className="text-[10px] text-accent-primary font-mono mt-2 opacity-70">
            API: {import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-bg-base border border-border-primary rounded-2xl p-8 shadow-2xl">

          {/* Email step */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Sign in</h2>
                <p className="text-sm text-text-muted">
                  Enter your <span className="text-text-secondary font-medium">@indium.tech</span> email address.
                  We'll send you a one-time code.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Work email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="you@indium.tech"
                    autoComplete="email"
                    autoFocus
                    required
                    className="w-full bg-bg-surface border border-border-primary rounded-xl pl-10 pr-4 py-3
                               text-sm text-text-primary placeholder-text-muted
                               focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary
                               transition-colors"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-accent-error bg-accent-error/10 border border-accent-error/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-secondary
                           disabled:opacity-40 disabled:cursor-not-allowed
                           text-white font-semibold text-sm rounded-xl py-3 transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Send code <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          )}

          {/* OTP step */}
          {step === 'otp' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Check your email</h2>
                <p className="text-sm text-text-muted">
                  We sent a 6-digit code to{' '}
                  <span className="text-text-secondary font-medium">{email}</span>.
                  Enter it below.
                </p>
              </div>
              
              {/* Test OTP (Always show during this test phase) */}
              {testOtp && (
                <div className="bg-accent-primary border border-accent-primary/20 rounded-xl p-4 text-center shadow-lg">
                  <p className="text-[10px] text-white uppercase tracking-[0.2em] font-bold mb-2">
                    Enter this Verification Code
                  </p>
                  <div className="text-3xl font-mono font-bold text-accent-primary tracking-[0.3em] bg-white py-2 rounded-lg border border-border-primary/50">
                    {testOtp}
                  </div>
                </div>
              )}

              {/* OTP boxes */}
              <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={loading}
                    className="w-11 h-14 text-center text-xl font-bold bg-bg-surface border border-border-primary
                               rounded-xl text-text-primary caret-accent-primary
                               focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary
                               disabled:opacity-50 transition-colors"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {loading && (
                <div className="flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
                </div>
              )}

              {error && (
                <p className="text-xs text-accent-error bg-accent-error/10 border border-accent-error/20 rounded-lg px-3 py-2 text-center">
                  {error}
                </p>
              )}

              {/* Resend + back */}
              <div className="flex items-center justify-between text-xs text-text-muted">
                <button
                  onClick={() => { setStep('email'); setError(''); setOtp(Array(OTP_LENGTH).fill('')); }}
                  className="hover:text-text-secondary transition-colors"
                >
                  ← Change email
                </button>

                <button
                  onClick={handleResend}
                  disabled={resendCountdown > 0 || loading}
                  className="flex items-center gap-1 hover:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          Session expires after 8 hours of inactivity.
        </p>
      </div>
    </div>
  );
}
