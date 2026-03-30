/**
 * AuthContext — provides { user, isLoading, logout } throughout the app.
 *
 * On mount, calls GET /api/v1/auth/me to restore session from the httpOnly cookie.
 * Auto-signs-out after 8 hours of inactivity (matches JWT expiry).
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { apiClient } from '@/lib/api/client';

export interface AuthUser {
  email: string;
  firstName?: string;
  lastName?: string;
  empId?: string;
  role?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  /** Call after successful OTP verification to update context without a page reload */
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Auto-sign-out after 8 hours of inactivity (matches JWT expiry)
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const IDLE_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click',
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async () => {
    try { await apiClient.post('/api/v1/auth/logout'); } catch { /* ignore */ }
    setUser(null);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    window.location.replace('/login');
  }, []);

  // Reset idle timer on user activity
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      logout();
    }, IDLE_TIMEOUT_MS);
  }, [logout]);

  // Attach / detach activity listeners
  useEffect(() => {
    if (!user) return;

    resetIdleTimer();
    IDLE_EVENTS.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      IDLE_EVENTS.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [user, resetIdleTimer]);

  // Restore session on mount
  useEffect(() => {
    apiClient
      .get<AuthUser>('/api/v1/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
