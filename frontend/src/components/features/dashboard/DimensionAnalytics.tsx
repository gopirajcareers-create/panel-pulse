import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';
import type { DimensionTrendPoint } from '@/types/chart.types';

const DIMENSION_COLORS: Record<string, string> = {
  mandatorySkillCoverage: '#818cf8',
  technicalDepth: '#f472b6',
  scenarioRiskEvaluation: '#34d399',
  frameworkKnowledge: '#fbbf24',
  handsOnValidation: '#f87171',
  leadershipEvaluation: '#60a5fa',
  behavioralAssessment: '#a78bfa',
  rejectionValidationAlignment: '#94e2d5',
};

const DIMENSION_LABELS: Record<string, string> = {
  mandatorySkillCoverage: 'Mandatory Skills',
  technicalDepth: 'Technical Depth',
  scenarioRiskEvaluation: 'Scenario/Risk',
  frameworkKnowledge: 'Framework',
  handsOnValidation: 'Hands-on',
  leadershipEvaluation: 'Leadership',
  behavioralAssessment: 'Behavioral',
  rejectionValidationAlignment: 'Alignment',
};

interface DimensionAnalyticsProps {
  data?: DimensionTrendPoint[];
  loading?: boolean;
}

export function DimensionAnalytics({ data = [], loading = false }: DimensionAnalyticsProps) {
  if (loading) {
    return (
      <Card className="h-80 flex items-center justify-center" role="status" aria-label="Loading dimension trends">
        <p className="text-text-muted">Loading chart...</p>
      </Card>
    );
  }

  // Group data by date and collect unique dimensions
  const chartData: any[] = [];
  const dateMap = new Map<string, any>();
  const uniqueDimensions = new Set<string>();

  if (data && data.length > 0) {
    data.forEach((point) => {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, { date: point.date });
      }
      const entry = dateMap.get(point.date);
      entry[point.dimension] = point.score;
      uniqueDimensions.add(point.dimension);
    });

    const sortedDates = Array.from(dateMap.keys()).sort();
    sortedDates.forEach((date) => {
      chartData.push(dateMap.get(date));
    });
  }

  return (
    <section className="mb-8" aria-label="Dimension trends over time">
      <h2 className="text-lg font-semibold text-text-primary mb-4">Dimension Trends</h2>
      <Card className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={chartData.length ? chartData : [{ date: 'No data' }]}
            aria-label="Line chart showing performance trends across 8 evaluation dimensions"
            role="img"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" aria-hidden="true" />
            <XAxis dataKey="date" stroke="#8b8ba0" tick={{ fontSize: 12 }} aria-label="Evaluation date" />
            <YAxis stroke="#8b8ba0" domain={[0, 2]} aria-label="Score (0-10 scale)" />
            <Tooltip
              contentStyle={{ background: '#1e1e28', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px' }}
              labelStyle={{ color: '#f1f1f5' }}
              aria-label="Dimension score details"
            />
            <Legend wrapperStyle={{ paddingTop: '16px' }} aria-label="Dimension legend" />
            {chartData.length > 0 && Array.from(uniqueDimensions).map((dim, idx) => {
              const colorList = Object.values(DIMENSION_COLORS);
              const color = colorList[idx % colorList.length];
              return (
                <Line
                  key={dim}
                  type="monotone"
                  dataKey={dim}
                  stroke={color}
                  name={dim}
                  dot={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </section>
  );
}

export default DimensionAnalytics;
