import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ScoreDistribution } from '@/types/chart.types';

interface ScoreDistributionProps {
  data?: ScoreDistribution[];
  loading?: boolean;
}

function getRangeColor(range: string): string {
  if (range === '8-10') return '#10b981'; // green
  if (range === '5-8') return '#f97316';  // orange
  return '#ef4444';                        // red (0-5)
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const color = getRangeColor(label);
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-slate-400 mb-1">Score Range: <span className="text-white font-semibold">{label}</span></p>
        <p className="text-sm font-bold" style={{ color }}>{payload[0].value} evaluation{payload[0].value !== 1 ? 's' : ''}</p>
      </div>
    );
  }
  return null;
}

export function ScoreDistribution({ data = [], loading = false }: ScoreDistributionProps) {
  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center" role="status" aria-label="Loading score distribution">
        <p className="text-text-muted text-sm">Loading chart...</p>
      </div>
    );
  }

  const chartData = data.length
    ? data
    : [
        { range: '0-5', count: 0 },
        { range: '5-8', count: 0 },
        { range: '8-10', count: 0 },
      ];

  return (
    <div className="flex flex-col" role="region" aria-label="Score distribution analysis">
      <h3 className="text-base font-semibold text-text-primary mb-4">Score Distribution</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} barCategoryGap="35%">
          <XAxis dataKey="range" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            cursor={false}
            content={<CustomTooltip />}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={getRangeColor(entry.range)} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ScoreDistribution;
