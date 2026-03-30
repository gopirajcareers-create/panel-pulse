import { LogOut } from 'lucide-react';
import { BrandSection } from './BrandSection';
import { NavigationMenu } from './NavigationMenu';
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

      {/* Indium branding */}
      <div className="pb-3 flex justify-center">
        <IndiumLogo className="w-40 opacity-70 hover:opacity-100 transition-opacity duration-200" />
      </div>
    </aside>
  );
}
