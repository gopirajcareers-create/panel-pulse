import { Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function BrandSection() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/dashboard')}
      className="flex items-center gap-3 pb-6 mb-6 border-b border-white/[0.07] w-full text-left hover:opacity-80 transition-opacity"
    >
      <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
        <Zap className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-text-primary leading-tight">
          Panel Pulse AI{' '}
          <span className="text-xs font-medium text-orange-400">[MVP]</span>
        </h1>
        <p className="text-[10px] text-text-muted leading-tight mt-0.5">An Indium HR TAG Initiative</p>
      </div>
    </button>
  );
}
