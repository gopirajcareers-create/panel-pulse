import { Download, FileText } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
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
  'Rejection Validation Alignment': 'rejectionValidationAlignment',
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

  function generateReportHTML(): string {
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
        'Identified Gaps:',
        'Identification Gaps:',
        'Overall Effectiveness:'
      ];

      return lines.map(line => {
        const trimmed = line.trim();
        const clean = trimmed.replace(/^[-*]\s*/, '');
        const isHeader = headers.some(h => clean.startsWith(h));

        if (isHeader) {
          const headerText = headers.find(h => clean.startsWith(h)) || '';
          const contentText = clean.substring(headerText.length).trim();
          
          return `<div style="font-size:11px;line-height:1.5;margin:8px 0 4px;">
                    <span style="font-weight:700;color:#f97316;">${esc(headerText)}</span>
                    ${contentText ? `<span style="color:#374151;margin-left:4px;">${esc(contentText)}</span>` : ''}
                  </div>`;
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
           <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#b91c1c;margin:0 0 6px">Identified Gaps</p>
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
    const l2Reasons: string[] =
      (evaluationData?.l2RejectionReasons?.length ?? 0) > 0
        ? evaluationData.l2RejectionReasons
        : store.l2RejectionReason ? [store.l2RejectionReason] : [];
    const storeL2 = store.l2ValidationResult;
    const l2Val = evaluationData?.l2Validation ?? storeL2 ?? {};
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

    // JD Skills - Improved layout for PDF consistency
    const rj = evaluationData?.refinedJd;
    function skillList(arr: string[]): string {
      return arr?.length
        ? arr.map(s => `<li style="font-size:10px;color:#374151;margin:2px 0;line-height:1.4">${esc(s)}</li>`).join('')
        : '<li style="color:#999;font-size:10px;font-style:italic">—</li>';
    }
    const jdHtml = rj
      ? `<div class="section-block" style="margin-top:24px;background:#fdfdfd;border:1px solid #e5e7eb;padding:16px;border-radius:8px;">
           <p style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#4b5563;margin:0 0 12px;border-bottom:1px solid #f3f4f6;padding-bottom:6px">JD Skill Classification</p>
           <div style="display:flex; justify-content: space-between; gap:15px;">
             <div style="flex: 1; min-width:0;">
               <p style="font-size:10px;font-weight:700;margin:0 0 6px;color:#111827;">
                 • Mandatory Skills
               </p>
               <ul style="margin:0;padding-left:10px;list-style-type:none;">${skillList(rj.mandatory_skills)}</ul>
             </div>
             <div style="flex: 1; min-width:0;">
               <p style="font-size:10px;font-weight:700;margin:0 0 6px;color:#111827;">
                 • Key Skills
               </p>
               <ul style="margin:0;padding-left:10px;list-style-type:none;">${skillList(rj.key_skills)}</ul>
             </div>
             <div style="flex: 1; min-width:0;">
               <p style="font-size:10px;font-weight:700;margin:0 0 6px;color:#111827;">
                 • Good to Have
               </p>
               <ul style="margin:0;padding-left:10px;list-style-type:none;">${skillList(rj.good_to_have_skills)}</ul>
             </div>
           </div>
         </div>`
      : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Panel Evaluation — ${esc(jobId)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; padding: 28px 32px; font-size: 12px; line-height: 1.4; }
    .header-bar { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #6366f1; padding-bottom:10px; margin-bottom:14px; }
    .meta-grid { display:flex; gap:24px; flex-wrap:wrap; margin-bottom:14px; }
    .meta-item { font-size:11px; }
    .score-hero { display:inline-flex; align-items:baseline; gap:6px; }
    .score-num { font-size:28px; font-weight:800; color:${categoryColour}; }
    .badge { display:inline-block; padding:2px 10px; border-radius:99px; font-size:10px; font-weight:700; color:#fff; background:${categoryColour}; text-transform:uppercase; margin-left:8px; }
    .section-title { font-size:10px; font-weight:700; text-transform:uppercase; color:#6b7280; margin:16px 0 6px; }
    table.dims { width:100%; border-collapse:collapse; font-size:11px; }
    table.dims thead th { background:#f3f4f6; padding:6px 10px; text-align:left; color:#6b7280; border-bottom:1px solid #e5e7eb; }
    .footer { margin-top:30px; padding-top:10px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-size:9px; color:#9ca3af; }
    .section-block { page-break-inside: avoid; margin-bottom: 20px; }
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
    </div>
    <div class="score-hero">
      <span class="score-num">${numScore.toFixed(1)}</span>
      <span class="score-denom">/ 10.0</span>
      <span class="badge">${scoreCategory}</span>
    </div>
  </div>

  <div class="section-block">
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
  </div>

  ${summaryHtml}
  ${gapHtml}
  ${l2Html}
  ${jdHtml}

  <div class="footer">
    <span>Generated by Panel Pulse AI · ${window.location.host}</span>
    <span>${dateStr} ${timeStr}</span>
  </div>
</body>
</html>`;
  }

  const handleExportHTML = () => {
    const html = generateReportHTML();
    const now = new Date();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `panel-eval-${jobId}-${now.toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const html = generateReportHTML();
    const now = new Date();
    
    // Create a temporary container for rendering
    const container = document.createElement('div');
    container.innerHTML = html;
    Object.assign(container.style, {
      position: 'absolute',
      left: '-9999px',
      top: '0',
      width: '800px',
      backgroundColor: '#ffffff',
      color: '#1f2937',
      padding: '40px'
    });
    document.body.appendChild(container);

    try {
      // Use higher scale for better quality
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 800
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      // Calculate how many pixels on canvas fit on one A4 page
      const pxPerPage = (canvasWidth * pdfHeight) / pdfWidth;
      const totalPages = Math.ceil(canvasHeight / pxPerPage);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        
        // Calculate the slice of the canvas to draw
        const srcY = i * pxPerPage;
        const srcH = Math.min(pxPerPage, canvasHeight - srcY);
        
        // If we want to be fancy and avoid cutting lines, we'd need more logic
        // but for now, simple slicing is a huge improvement.
        
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvasWidth;
        pageCanvas.height = pxPerPage;
        const ctx = pageCanvas.getContext('2d');
        
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(canvas, 0, srcY, canvasWidth, srcH, 0, 0, canvasWidth, srcH);
          
          const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.9);
          pdf.addImage(pageImgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
          
          // Add page number
          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text(`Page ${i + 1} of ${totalPages}`, pdfWidth - 25, pdfHeight - 5);
        }
      }
      
      pdf.save(`panel-eval-${jobId}-${now.toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('PDF Export failed:', error);
    } finally {
      document.body.removeChild(container);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleExportHTML}
        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/40 hover:bg-slate-700/40 text-text-primary text-sm font-medium rounded-lg border border-slate-700/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
        title="Download Report as HTML"
      >
        <Download className="w-4 h-4 text-indigo-400" />
        Export HTML
      </button>

      <button
        type="button"
        onClick={handleExportPDF}
        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-sm font-medium rounded-lg border border-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        title="Download Report as PDF"
      >
        <FileText className="w-4 h-4 text-indigo-400" />
        Export PDF
      </button>
    </div>
  );
}
