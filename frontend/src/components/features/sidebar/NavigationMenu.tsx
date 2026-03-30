import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Upload, MessageSquare, Check, Users } from 'lucide-react';

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  path: string;
  description: string;
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    icon: <BarChart3 className="w-5 h-5" />,
    label: 'Dashboard',
    path: '/',
    description: 'View analytics',
  },
  {
    id: 'evaluate',
    icon: <Upload className="w-5 h-5" />,
    label: 'Evaluate',
    path: '/evaluate',
    description: 'Upload & score',
  },
  {
    id: 'panels',
    icon: <Users className="w-5 h-5" />,
    label: 'Panel Insights',
    path: '/panels',
    description: 'Interviewer directory',
  },
  {
    id: 'chat',
    icon: <MessageSquare className="w-5 h-5" />,
    label: 'Chat',
    path: '/chat',
    description: 'Ask the AI',
  },
];

export function NavigationMenu() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-widest text-text-muted px-1 mb-3">Navigation</p>
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg transition-all ${
              isActive
                ? 'bg-primary/12 border border-primary/30'
                : 'hover:bg-white/[0.05] border border-transparent'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className={`mt-0.5 flex-shrink-0 ${isActive ? 'text-primary' : 'text-text-muted'}`}>
              {item.icon}
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${isActive ? 'text-text-primary' : 'text-text-muted'}`}>
                  {item.label}
                </p>
                {isActive && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-xs text-text-muted">{item.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
