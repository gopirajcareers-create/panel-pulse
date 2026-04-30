import { BarChart3, TrendingUp, Users } from 'lucide-react';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  loading?: boolean;
  iconBg?: string;
  iconColor?: string;
}

function StatCard({ icon, label, value, loading = false, iconBg = 'from-orange-500/20 to-orange-600/10', iconColor = 'text-orange-400' }: StatCardProps) {
  return (
    <div
      className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-5 py-4 shadow-lg hover:shadow-xl hover:border-slate-600/70 transition-all duration-300 group backdrop-blur-sm"
      role="region"
      aria-label={label}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 bg-gradient-to-br ${iconBg} rounded-lg flex-shrink-0`} aria-hidden="true">
          <div className={`w-5 h-5 ${iconColor}`}>{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-white leading-tight" aria-live="polite" aria-atomic="true">
            {loading ? '—' : value}
          </p>
        </div>
      </div>
    </div>
  );
}

interface QuickStatsCardsProps {
  totalEvaluations?: number;
  averageScore?: number;
  totalPanels?: number;
  loading?: boolean;
}

export function QuickStatsCards({
  totalEvaluations = 0,
  averageScore = 0,
  totalPanels = 0,
  loading = false,
}: QuickStatsCardsProps) {
  return (
    <>
      <StatCard
        icon={<BarChart3 className="w-5 h-5" />}
        label="Total Evaluations"
        value={totalEvaluations}
        loading={loading}
        iconBg="from-indigo-500/20 to-indigo-600/10"
        iconColor="text-indigo-400"
      />
      <StatCard
        icon={<TrendingUp className="w-5 h-5" />}
        label="Total Average Score"
        value={averageScore.toFixed(1)}
        loading={loading}
        iconBg="from-orange-500/20 to-orange-600/10"
        iconColor="text-orange-400"
      />
      <StatCard
        icon={<Users className="w-5 h-5" />}
        label="Total Panel Evaluated"
        value={totalPanels}
        loading={loading}
        iconBg="from-emerald-500/20 to-emerald-600/10"
        iconColor="text-emerald-400"
      />
    </>
  );
}

export default QuickStatsCards;
