import React from 'react';
import { Download } from 'lucide-react';
import { useEvaluationStore } from '@/lib/stores/evaluation.store';
import { DIMENSIONS } from '@/types/evaluation.types';

const BACKEND_LABEL_TO_CAMEL: Record<string, string> = {
  'Mandatory Skill Coverage': 'mandatorySkillCoverage',
  'Technical Depth': 'technicalDepth',
  'Scenario / Risk Evaluation': 'scenarioRiskEvaluation',
  'Framework Knowledge': 'frameworkKnowledge',
  'Hands-on Validation': 'handsOnValidation',
  'Leadership Evaluation': 'leadershipEvaluation',
  'Behavioral Assessment': 'behavioralAssessment',
  'Interview Structure': 'interviewStructure',
};

interface Props {
  jobId: string;
  evaluationId?: string;
  panelName?: string;
  candidateName?: string;
  score?: number;
  categories?: Record<string, number> | null;
  /** Full cached evaluation object for rich PDF export */
  evaluationData?: any | null;
}

export function ExportButton({
  jobId,
  evaluationId,
  panelName,
  candidateName,
  score,
  categories,
  evaluationData,
}: Props) {
  const store = useEvaluationStore();
  const effectiveScore = score ?? store.panelScore ?? 0;
  const effectiveCategories = (categories ?? store.dimensions) as Record<string, number> | null;

  /** Resolve category score regardless of key format (camelCase or backend label) */
  function getScore(camelKey: string): number {
    if (!effectiveCategories) return 0;
    if (camelKey in effectiveCategories) return Number(effectiveCategories[camelKey] ?? 0);
    // try reverse lookup
    for (const [label, ck] of Object.entries(BACKEND_LABEL_TO_CAMEL)) {
      if (ck === camelKey && label in effectiveCategories) return Number((effectiveCategories as any)[label] ?? 0);
    }
    return 0;
  }

  /** Resolve evidence array for a dimension camelKey */
  function getEvidence(camelKey: string): string[] {
    const ev: Record<string, string[]> =
      evaluationData?.evidence ?? (store.evidence as Record<string, string[]>) ?? {};
    if (Array.isArray(ev[camelKey])) return ev[camelKey];
    for (const [label, ck] of Object.entries(BACKEND_LABEL_TO_CAMEL)) {
      if (ck === camelKey && Array.isArray(ev[label])) return ev[label];
    }
    return [];
  }

  function esc(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function downloadPDF() {
    const numScore = Number(effectiveScore);
    const scoreCategory = numScore >= 8 ? 'Good' : numScore >= 5 ? 'Moderate' : 'Poor';
    const categoryColour = scoreCategory === 'Good' ? '#059669' : scoreCategory === 'Moderate' ? '#d97706' : '#dc2626';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Dimension rows
    const dimRows = Object.entries(DIMENSIONS).map(([camelKey, def]) => {
      const s = getScore(camelKey);
      const pct = def.maxScore > 0 ? Math.min(100, (s / def.maxScore) * 100) : 0;
      const evList = getEvidence(camelKey);
      const evHtml = evList.length
        ? evList.map(e => `<li style="margin:2px 0;color:#555;font-style:italic">${esc(e)}</li>`).join('')
        : '<li style="color:#aaa">No evidence recorded</li>';
      const barColour = s / def.maxScore >= 0.8 ? '#059669' : s / def.maxScore >= 0.5 ? '#d97706' : '#dc2626';
      return `
        <tr>
          <td style="padding:8px 10px;vertical-align:top;width:28%">
            <strong style="font-size:11px">${esc(def.name)}</strong>
          </td>
          <td style="padding:8px 10px;vertical-align:top;width:10%;text-align:center">
            <span style="font-weight:700;color:${barColour}">${s.toFixed(2)}</span>
            <span style="color:#999;font-size:10px"> / ${def.maxScore.toFixed(2)}</span>
          </td>
          <td style="padding:8px 10px;vertical-align:middle;width:14%">
            <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden">
              <div style="background:${barColour};width:${pct.toFixed(0)}%;height:100%;border-radius:4px"></div>
            </div>
          </td>
          <td style="padding:8px 10px;vertical-align:top;width:48%">
            <ul style="margin:0;padding-left:16px;font-size:10px">${evHtml}</ul>
          </td>
        </tr>`;
    }).join('');

    // Panel summary
    const parseSummaryToHtml = (text: string | null) => {
      if (!text) return '';
      const lines = text.split('\n').filter(Boolean);
      const headers = [
        'Panel Member Behavior:',
        'Interview Process:',
        'Rejection Reason Validation:',
        'Identification Gap:',
        'Overall Effectiveness:'
      ];

      return lines.map(line => {
        const trimmed = line.trim();
        const clean = trimmed.replace(/^[-*]\s*/, '');
        const isHeader = headers.some(h => clean.startsWith(h));

        if (isHeader) {
          return `<p style="font-size:11px;font-weight:700;color:#f97316;margin:8px 0 4px">${esc(clean)}</p>`;
        }
        return `<div style="font-size:11px;color:#374151;line-height:1.5;margin:2px 0;padding-left:10px;position:relative;">
                  <span style="position:absolute;left:0;color:#f97316;">•</span>
                  ${esc(clean)}
                </div>`;
      }).join('');
    }

    const summaryHtml = evaluationData?.panelSummary
      ? `<div class="section-block" style="margin-top:18px;padding:12px 14px;background:#f8fafc;border-left:3px solid ${categoryColour};border-radius:4px">
           <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin:0 0 6px">Panel Summary</p>
           ${parseSummaryToHtml(evaluationData.panelSummary)}
         </div>`
      : '';

    const gapHtml = evaluationData?.gap_analysis || evaluationData?.gapAnalysis || store.gapAnalysis
      ? `<div class="section-block" style="margin-top:18px;padding:12px 14px;background:#fff1f2;border-left:3px solid #ef4444;border-radius:4px">
           <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#b91c1c;margin:0 0 6px">Identification Gaps</p>
           <ul style="margin:0;padding-left:14px">
             ${(evaluationData?.gap_analysis || evaluationData?.gapAnalysis || store.gapAnalysis || '')
               .split('\n')
               .map((line: string) => line.trim().replace(/^[-*]\s*/, ''))
               .filter(Boolean)
               .map((item: string) => `<li style="font-size:11px;color:#991b1b;margin:2px 0;line-height:1.5;font-style:italic">→ ${esc(item)}</li>`)
               .join('')}
           </ul>
         </div>`
      : '';

    // L2 rejection reasons + probing verdict
    // Falls back to Zustand store values for fresh evaluations or old cached records
    const l2Reasons: string[] =
      (evaluationData?.l2RejectionReasons?.length ?? 0) > 0
        ? evaluationData.l2RejectionReasons
        : store.l2RejectionReason ? [store.l2RejectionReason] : [];
    const storeL2 = store.l2ValidationResult;
    const l2Val = evaluationData?.l2Validation ?? storeL2 ?? {};
    // Handle both DB format (probing_verdict) and live-hook format (probingDepth)
    const probingRaw: string =
      l2Val?.probing_verdict
      ?? (l2Val?.probingDepth ? String(l2Val.probingDepth).replace(/ /g, '_').toUpperCase() : '')
      ?? '';
    const probingLabel = probingRaw
      ? probingRaw.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : '';
    const probingColour =
      probingRaw.includes('DEEP') ? '#059669' :
        probingRaw.includes('ADEQUATE') ? '#d97706' :
          probingRaw.includes('SURFACE') ? '#dc2626' :
            probingRaw.includes('NO') ? '#6b7280' : '#6b7280';
    const l2Verdict: string = l2Val?.verdict ?? '';
    const l2Comments: string = l2Val?.comments ?? '';
    const hasL2 = l2Reasons.length > 0 || probingLabel || l2Verdict;
    const l2Html = hasL2
      ? `<div class="section-block" style="margin-top:18px;padding:12px 14px;background:#fff7ed;border-left:3px solid #f97316;border-radius:4px">
           <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin:0 0 8px">L2 Validation</p>
           ${probingLabel ? `<div style="margin-bottom:8px"><span style="font-size:10px;font-weight:700;color:#fff;background:${probingColour};padding:2px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em">${esc(probingLabel)}</span>${l2Verdict ? `<span style="font-size:11px;color:#374151;margin-left:10px">${esc(l2Verdict)}</span>` : ''}</div>` : ''}
           ${l2Comments ? `<p style="font-size:11px;color:#374151;margin:0 0 8px;line-height:1.5">${esc(l2Comments)}</p>` : ''}
            ${l2Reasons.length ? `<p style="font-size:10px;font-weight:600;color:#374151;margin:0 0 4px">Rejection Reasons:</p>
            <ul style="margin:0;padding-left:18px">
              ${l2Reasons.map((r: string) => {
                const jf = l2Val?.justifications?.[r];
                const summary = (typeof jf === 'object' && !Array.isArray(jf)) ? (jf as any).summary : null;
                const points = Array.isArray(jf) ? jf : ((jf as any)?.points || []);
                
                return `<li style="font-size:11px;color:#374151;margin:4px 0;line-height:1.5">
                  <div style="font-weight:600;color:#1f2937;margin-bottom:2px">${esc(r)}</div>
                  ${summary ? `<p style="font-size:10px;color:#4b5563;margin:0 0 4px;line-height:1.4">${esc(summary)}</p>` : ''}
                  ${points.length > 0 ? `
                    <ul style="margin:2px 0 4px;padding-left:12px;list-style:none;">
                      ${points.map((p: string) => `<li style="font-size:10px;color:#6b7280;margin:1px 0;font-style:italic">→ ${esc(p)}</li>`).join('')}
                    </ul>
                  ` : ''}
                </li>`;
              }).join('')}
            </ul>` : ''}
          </div>`
      : '';

    // JD Skills
    const rj = evaluationData?.refinedJd;
    function skillList(arr: string[]): string {
      return arr?.length
        ? arr.map(s => `<li style="font-size:10px;color:#374151;margin:1px 0">${esc(s)}</li>`).join('')
        : '<li style="color:#aaa;font-size:10px">—</li>';
    }
    const jdHtml = rj
      ? `<div class="section-block" style="margin-top:18px">
           <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin:0 0 8px">JD Skill Classification</p>
           <table style="width:100%;border-collapse:collapse">
             <tr>
               <td style="padding:0 10px 0 0;vertical-align:top;width:33%">
                 <p style="font-size:10px;font-weight:600;margin:0 0 3px;color:#1f2937">Mandatory Skills</p>
                 <ul style="margin:0;padding-left:14px">${skillList(rj.mandatory_skills)}</ul>
               </td>
               <td style="padding:0 10px;vertical-align:top;width:33%">
                 <p style="font-size:10px;font-weight:600;margin:0 0 3px;color:#1f2937">Key Skills</p>
                 <ul style="margin:0;padding-left:14px">${skillList(rj.key_skills)}</ul>
               </td>
               <td style="padding:0 0 0 10px;vertical-align:top;width:34%">
                 <p style="font-size:10px;font-weight:600;margin:0 0 3px;color:#1f2937">Good to Have</p>
                 <ul style="margin:0;padding-left:14px">${skillList(rj.good_to_have_skills)}</ul>
               </td>
             </tr>
           </table>
         </div>`
      : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Panel Evaluation — ${esc(jobId)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; padding: 28px 32px; font-size: 12px; }
    @media print {
      body { padding: 16px 20px; }
      @page { margin: 10mm; size: A4; }
    }
    .header-bar { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #6366f1; padding-bottom:10px; margin-bottom:14px; }
    .brand { font-size:14px; font-weight:700; color:#6366f1; letter-spacing:.03em; }
    .meta-grid { display:flex; gap:24px; flex-wrap:wrap; margin-bottom:14px; }
    .meta-item { font-size:11px; }
    .meta-item span { color:#6b7280; }
    .score-hero { display:inline-flex; align-items:baseline; gap:6px; }
    .score-num { font-size:28px; font-weight:800; color:${categoryColour}; }
    .score-denom { font-size:14px; color:#9ca3af; }
    .badge { display:inline-block; padding:2px 10px; border-radius:99px; font-size:10px; font-weight:700; color:#fff; background:${categoryColour}; letter-spacing:.04em; text-transform:uppercase; margin-left:8px; }
    .section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#6b7280; margin:16px 0 6px; }
    table.dims { width:100%; border-collapse:collapse; font-size:11px; }
    table.dims thead th { background:#f3f4f6; padding:6px 10px; text-align:left; font-size:10px; text-transform:uppercase; color:#6b7280; letter-spacing:.04em; border-bottom:1px solid #e5e7eb; }
    table.dims tbody tr:nth-child(even) { background:#f9fafb; }
    table.dims tbody tr { border-bottom:1px solid #f3f4f6; }
    .footer { margin-top:20px; padding-top:8px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-size:9px; color:#9ca3af; }
    .section-block { page-break-inside: avoid; break-inside: avoid; }
    table.dims tbody tr { border-bottom:1px solid #f3f4f6; page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div style="display:flex; align-items:center; gap:12px;">
      <img src="${window.location.origin}/INDIUM LOGO.png" alt="Indium Logo" style="height:32px; object-fit:contain;" />
    </div>
    <span style="font-size:10px;color:#9ca3af">${dateStr} · ${timeStr}</span>
  </div>

  <div style="margin-bottom:14px">
    <h1 style="font-size:16px;font-weight:700;color:#111827;margin-bottom:6px">Panel Evaluation Report</h1>
    <div class="meta-grid">
      <div class="meta-item"><span>Job ID: </span><strong>${esc(jobId)}</strong></div>
      ${panelName ? `<div class="meta-item"><span>Panel: </span><strong>${esc(panelName)}</strong></div>` : ''}
      ${candidateName ? `<div class="meta-item"><span>Candidate: </span><strong>${esc(candidateName)}</strong></div>` : ''}
      ${evaluationId ? `<div class="meta-item"><span>Eval ID: </span><strong style="font-size:9px;color:#9ca3af">${esc(evaluationId)}</strong></div>` : ''}
    </div>
    <div class="score-hero">
      <span class="score-num">${numScore.toFixed(1)}</span>
      <span class="score-denom">/ 10.0</span>
      <span class="badge">${scoreCategory}</span>
    </div>
  </div>

  <p class="section-title">Dimension Breakdown</p>
  <table class="dims">
    <thead>
      <tr>
        <th style="width:28%">Dimension</th>
        <th style="width:10%;text-align:center">Score</th>
        <th style="width:14%">Progress</th>
        <th style="width:48%">Panel Evidence</th>
      </tr>
    </thead>
    <tbody>${dimRows}</tbody>
  </table>

  ${summaryHtml}
  ${gapHtml}
  ${l2Html}
  ${jdHtml}

  <div class="footer">
    <span>Generated by Panel Pulse AI · panel-pulse.vercel.app</span>
    <span>${dateStr} ${timeStr}</span>
  </div>
</body>
</html>`;

    // Create a Blob and trigger an instant download
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `panel-eval-${jobId}-${now.toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={downloadPDF}
      className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/15 border border-orange-500/30 text-orange-300 rounded-lg hover:bg-orange-500/25 transition-colors text-sm font-medium"
    >
      <Download className="w-4 h-4" />
      Export PDF
    </button>
  );
}
