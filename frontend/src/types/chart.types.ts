export interface ScoreDistribution {
  range: string; // e.g. '0-2'
  count: number;
}

export interface DimensionTrendPoint {
  date: string; // ISO date
  dimension: string;
  score: number;
}
