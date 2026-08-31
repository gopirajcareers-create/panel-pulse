import type {
  SkillBucketBreakdown, SkillGrade, SkillMatchRow, SkillTier,
} from '@/lib/api/pipeline.api';

/**
 * How a skill's grade becomes points, mirrored from the backend's skillMatchScoring.
 *
 * This file exists so the screen and the downloaded report cannot drift apart. `tierOf`
 * is duplicated between CandidateResultsPage and reportGenerator because each carries its
 * own presentation, but a *credit* that differs between the two would mean the report and
 * the screen state different arithmetic behind the same stored score — so the numbers and
 * the fallbacks live here once.
 *
 * Nothing here recomputes the score. The backend does that and stores it; these helpers
 * only explain the number that came back.
 */
export const GRADE_CREDIT: Record<SkillGrade, number> = {
  STRONG: 1.0,
  PARTIAL_HIGH: 1.0,
  PARTIAL_MID: 0.75,
  PARTIAL_LOW: 0.5,
  NONE: 0,
};

const GRADES = Object.keys(GRADE_CREDIT) as SkillGrade[];

/** The three partial grades, strongest first — the order they are reported in. */
export const PARTIAL_GRADES: SkillGrade[] = ['PARTIAL_HIGH', 'PARTIAL_MID', 'PARTIAL_LOW'];

/**
 * What each grade is called on screen.
 *
 * A partial's label carries its credit because that is the whole point of splitting the
 * tier: "Partial" alone told the reader nothing about whether the row was worth 1.0 or
 * half that, which is a 0.5-of-a-skill difference in the score beside it.
 */
export const GRADE_LABEL: Record<SkillGrade, string> = {
  STRONG: 'Strong',
  PARTIAL_HIGH: 'Partial · 1.0',
  PARTIAL_MID: 'Partial · 0.75',
  PARTIAL_LOW: 'Partial · 0.5',
  NONE: 'Not found',
};

/**
 * Recover a row's grade.
 *
 * Three generations of stored records have to render: graded rows carry `grade`; tiered
 * rows carry `tier` and a flat `credit` of 0.5; pre-tier rows carry only `matched`. The
 * credit-based fallback is what stops a re-opened older record reporting "2 partial
 * (0 full, 0 at 0.75, 0 at 0.5)", which reads as a bug in the census rather than as an
 * absence of grades.
 */
export function gradeOf(row: Partial<SkillMatchRow> | null | undefined): SkillGrade {
  const claimed = String(row?.grade || '').toUpperCase() as SkillGrade;
  if (GRADES.includes(claimed)) return claimed;

  const tier: SkillTier = row?.tier === 'STRONG' || row?.tier === 'PARTIAL' || row?.tier === 'NONE'
    ? row.tier
    : (row?.matched ? 'STRONG' : 'NONE');
  if (tier !== 'PARTIAL') return tier;

  const credit = Number(row?.credit);
  if (credit >= 1) return 'PARTIAL_HIGH';
  if (credit >= 0.75) return 'PARTIAL_MID';
  return 'PARTIAL_LOW';
}

/** The tier a grade belongs to, for the chip colour and the three-way census. */
export function tierOfGrade(grade: SkillGrade): SkillTier {
  return grade === 'STRONG' || grade === 'NONE' ? grade : 'PARTIAL';
}

export interface BucketBreakup {
  /** Percentage points this bucket can contribute at full coverage. */
  weight: number;
  /** Points it actually contributed — credit_earned / skills x weight. */
  points: number;
  creditEarned: number;
  skills: number;
  /** Grade census, always derived from the rows so pre-grade records count correctly. */
  counts: Record<SkillGrade, number>;
  /** e.g. "1 at full credit, 2 at 0.75" — empty when the bucket has no partials. */
  partialSplit: string;
}

/**
 * The breakup behind one bucket's contribution: how many skills, what they earned, and
 * what that came to in points.
 *
 * Only the weight was on screen before, which left the reader to work out why 4 mandatory
 * skills worth 80 points had produced 45 — the two numbers that turn one into the other
 * (2.25 of 4 credits earned) were the ones missing.
 *
 * `points` and `creditEarned` are read from the stored breakdown rather than recomputed,
 * so this line can never state arithmetic that disagrees with the score it sits under;
 * they are only derived for records stored before the backend recorded them.
 */
export function bucketBreakupOf(
  // Partial, because the fields are only required of records the current backend wrote —
  // the whole reason this function exists is the stored ones that predate some of them.
  bucket: Partial<SkillBucketBreakdown> | undefined | null,
  rows: SkillMatchRow[] | undefined | null,
): BucketBreakup | null {
  if (!bucket) return null;

  const counts = GRADES.reduce((acc, g) => ({ ...acc, [g]: 0 }), {} as Record<SkillGrade, number>);
  for (const r of rows || []) counts[gradeOf(r)]++;

  // `count` was this field's name before it was renamed for clarity; stored records still
  // carry the old key, and falling back to the row count keeps a bucket from reading "of 0".
  const skills = bucket.skills ?? (bucket as { count?: number }).count ?? (rows?.length || 0);
  const weight = bucket.weight ?? 0;
  const creditEarned = typeof bucket.credit_earned === 'number'
    ? bucket.credit_earned
    : (rows || []).reduce((s, r) => s + GRADE_CREDIT[gradeOf(r)], 0);
  const points = typeof bucket.points === 'number'
    ? bucket.points
    : (skills ? (creditEarned / skills) * weight : 0);

  const partialSplit = PARTIAL_GRADES
    .filter(g => counts[g] > 0)
    .map(g => `${counts[g]} at ${g === 'PARTIAL_HIGH' ? 'full credit' : GRADE_CREDIT[g]}`)
    .join(', ');

  return { weight, points, creditEarned, skills, counts, partialSplit };
}

/** Trim trailing zeros so a whole number of points does not print as "45.00". */
export function num(n: number): string {
  return String(Number(n.toFixed(2)));
}
