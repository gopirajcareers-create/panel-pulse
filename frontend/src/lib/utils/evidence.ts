/**
 * Panel evidence display helpers.
 *
 * The backend now collapses repeated quotes before scoring (see
 * `evidenceTierScoring.dedupeEvidenceItems`), so records evaluated from here on
 * arrive clean. Records evaluated BEFORE that fix still carry the padding — on
 * SAAS_QA/Dharshini every L1 dimension held eight copies of one question, because
 * the scoring prompt allows "up to 8 items" and the model treated the ceiling as a
 * target. Those records are not re-scored on read, so the duplicates have to be
 * collapsed at the point of display or the report prints the same question eight
 * times over.
 */

/**
 * Identity of a quote for duplicate detection. Case, whitespace and punctuation are
 * not what makes two questions different; the whole quote is compared rather than a
 * prefix, so two long questions that open the same way stay distinct.
 *
 * Mirrors `quoteKey` in backend/src/services/evidenceTierScoring.js — the report and
 * the score must count the same evidence.
 */
function quoteKey(quote: string): string {
  return String(quote ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The quotes for one dimension, blanks dropped and repeats collapsed, in order. */
export function dedupeEvidence(quotes: unknown): string[] {
  if (!Array.isArray(quotes)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of quotes) {
    const quote = String(raw ?? '').trim();
    const key = quoteKey(quote);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(quote);
  }
  return out;
}
