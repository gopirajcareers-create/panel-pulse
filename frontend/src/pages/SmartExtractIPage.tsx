import { AppShell } from '@/components/layout/AppShell';
import { SmartExtractIForm } from '@/components/features/smart-extract-i/SmartExtractIForm';
import { ArrowLeft, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SmartExtractIPage() {
  const navigate = useNavigate();
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-bg-base p-8">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-violet-500/10 border border-violet-500/30 rounded-xl">
                <Layers className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-text-primary">Smart Extract — I</h1>
                <p className="text-text-muted text-sm mt-1">
                  4-Stage Interview Pipeline · JD ID + Candidate Name as primary key
                </p>
              </div>
            </div>
            <p className="text-text-muted text-sm leading-relaxed max-w-3xl">
              Upload documents stage by stage — Initial Screening, L1 Scoring, L2 Scoring, and Client Audit.
              JD and Resume are stored after Stage 1 and automatically carried forward to subsequent stages.
            </p>
          </div>

          <SmartExtractIForm />
        </div>
      </div>
    </AppShell>
  );
}
