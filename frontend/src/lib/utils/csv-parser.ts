/**
 * RFC-4180 compliant CSV parser
 *
 * Handles:
 *  - Quoted fields with embedded commas
 *  - Quoted fields with embedded newlines (multi-line content e.g. long transcripts)
 *  - Escaped double-quotes inside quoted fields ("")
 *  - BOM stripping
 *  - CRLF and LF line endings
 *  - Empty rows skipped
 */

export interface CsvResult {
  /** Normalized header names (lowercase, trimmed) */
  headers: string[];
  /** Array of row objects keyed by normalized header */
  rows: Record<string, string>[];
}

/**
 * Parse a raw CSV string into a structured result.
 * The first row is treated as the header row.
 * Header names are lowercased and trimmed for consistent matching.
 */
export function parseCsvString(raw: string): CsvResult {
  // Strip BOM
  const content = raw.replace(/^\uFEFF/, '');
  if (!content.trim()) return { headers: [], rows: [] };

  const allRows: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1] ?? '';

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        // Escaped double-quote inside a quoted field
        field += '"';
        i += 2;
      } else if (ch === '"') {
        // End of quoted field
        inQuotes = false;
        i++;
      } else {
        // Regular character inside quotes (preserves embedded newlines etc.)
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(field.trim());
        field = '';
        if (currentRow.some((f) => f !== '')) allRows.push(currentRow);
        currentRow = [];
        i += 2;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(field.trim());
        field = '';
        if (currentRow.some((f) => f !== '')) allRows.push(currentRow);
        currentRow = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Handle the last field / row
  currentRow.push(field.trim());
  if (currentRow.some((f) => f !== '')) allRows.push(currentRow);

  if (allRows.length === 0) return { headers: [], rows: [] };

  // First row → headers (normalize to lowercase trimmed)
  const headers = allRows[0].map((h) => h.trim().toLowerCase());

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < allRows.length; r++) {
    const rowCells = allRows[r];
    const obj: Record<string, string> = {};
    let hasContent = false;
    headers.forEach((h, idx) => {
      const val = (rowCells[idx] ?? '').trim();
      obj[h] = val;
      if (val) hasContent = true;
    });
    if (hasContent) rows.push(obj);
  }

  return { headers, rows };
}

/**
 * Find the matching header key from a list of acceptable alias strings.
 *
 * Comparison normalizes both sides: lowercase + remove spaces/underscores/hyphens.
 * Returns the actual header key as it appears in `headers`, or null if not found.
 *
 * @example
 *   findColumnKey(['job interview id', 'panel name'], ['panelname', 'panel_name'])
 *   // → 'panel name'
 */
export function findColumnKey(headers: string[], aliases: string[]): string | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '');
  for (const alias of aliases) {
    const target = normalize(alias);
    const match = headers.find((h) => normalize(h) === target);
    if (match !== undefined) return match;
  }
  return null;
}
