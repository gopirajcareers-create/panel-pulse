import { LogOut } from 'lucide-react';
import { BrandSection } from './BrandSection';
import { NavigationMenu } from './NavigationMenu';
import { SettingsButton } from './SettingsButton';
import { IndiumLogo } from './IndiumLogo';
import { useAuth } from '@/context/AuthContext';

export function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-[260px] shrink-0 bg-bg-surface border-r border-white/[0.07] flex flex-col h-full overflow-y-auto p-5">
      {/* Brand */}
      <BrandSection />

      {/* Navigation */}
      <NavigationMenu />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Indium branding — above Settings */}
      <div className="pb-3 flex justify-center">
        <IndiumLogo className="w-40 opacity-70 hover:opacity-100 transition-opacity duration-200" />
      </div>

      {/* Settings */}
      <div className="pt-3 border-t border-white/[0.07]">
        <SettingsButton />
      </div>

      {/* User info + logout */}
      {user && (
        <div className="mt-2 pt-3 border-t border-white/[0.07]">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs text-text-muted truncate" title={user.email}>
                {user.email}
              </p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-accent-error hover:bg-accent-error/10 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
