import { LogOut } from 'lucide-react';
import { Sidebar } from '@/components/features/sidebar/Sidebar';
import { useAuth } from '@/context/AuthContext';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen w-full bg-bg-base overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-14 shrink-0 border-b border-white/[0.07] bg-bg-surface/50 backdrop-blur-md flex items-center justify-end px-6 z-10">
          {user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-tight">
                <span className="text-text-muted">Logged in as:</span>
                <span className="text-accent-primary font-bold drop-shadow-[0_0_8px_rgba(255,107,74,0.3)]">
                  {user.email}
                </span>
              </div>
              
              <div className="h-4 w-px bg-white/10" />

              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-text-muted hover:text-accent-error hover:bg-accent-error/10 transition-all duration-200 group"
              >
                <span className="text-[11px] font-bold uppercase tracking-wider group-hover:translate-x-[-2px] transition-transform">Logout</span>
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
          {children}
        </main>
      </div>
    </div>
  );
}
