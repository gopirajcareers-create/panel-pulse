import { AppShell } from '@/components/layout/AppShell';

export default function HistoryPage() {
  return (
    <AppShell>
      <div className="flex-1 flex items-center justify-center overflow-y-auto bg-bg-base">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Evaluation History</h1>
          <p className="text-text-muted">Past evaluations coming in Phase 7</p>
        </div>
      </div>
    </AppShell>
  );
}
