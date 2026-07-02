import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { PipelineDetail } from '@/lib/api/pipeline.api';

interface ReportGeneratorOptions {
  data: PipelineDetail;
  stageId?: 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'overall';
  format: 'html' | 'pdf';
}

function esc(s: string | undefined | null): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ============================================
// STAGE 1: SCREENING REPORT
// ============================================
function generateStage1HTML(data: PipelineDetail): string {
  const analysis = data.stage1?.analysis;
  if (!analysis) return '<p>No screening data available.</p>';

  const statusColor =
    analysis.status === 'Eligible' ? '#059669' :
    analysis.status === 'Partially Eligible' ? '#d97706' : '#dc2626';

  const mandatorySkillsRows = (analysis.mandatorySkillsMatch || []).map(item => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">
        <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${item.matched ? '#059669' : '#dc2626'};color:white;text-align:center;line-height:18px;font-size:11px;font-weight:bold;">${item.matched ? '✓' : '✗'}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;">${esc(item.skill)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:11px;">${esc(item.evidence)}</td>
    </tr>
  `).join('');

  const additionalSkillsRows = (analysis.additionalSkillsMatch || []).map(item => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">
        <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${item.matched ? '#059669' : '#dc2626'};color:white;text-align:center;line-height:18px;font-size:11px;font-weight:bold;">${item.matched ? '✓' : '✗'}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;">${esc(item.skill)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:11px;">${esc(item.evidence)}</td>
    </tr>
  `).join('');

  return `
    <div class="stage-section">
      <h2 style="color:#7c3aed;font-size:18px;font-weight:700;margin-bottom:16px;border-bottom:2px solid #7c3aed;padding-bottom:8px;">Stage 1: Screening Results</h2>

      <div style="background:#f8fafc;border-left:3px solid ${statusColor};padding:16px;margin-bottom:20px;border-radius:4px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <span style="display:inline-block;padding:4px 12px;background:${statusColor};color:white;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:99px;">${esc(analysis.status)}</span>
          <span style="font-size:14px;font-weight:700;color:#111827;">Match Score: ${analysis.matchScore}%</span>
        </div>
        <p style="font-size:11px;color:#4b5563;margin:0;"><strong>Experience Match:</strong> ${esc(analysis.experienceMatch)}</p>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Screening Summary</h3>
        <p style="font-size:11px;color:#374151;line-height:1.6;background:white;padding:12px;border:1px solid #e5e7eb;border-radius:4px;font-style:italic;">
          "${esc(analysis.screeningSummary)}"
        </p>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Mandatory Skills Coverage</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;background:white;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;width:60px;">Status</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Skill</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Evidence</th>
            </tr>
          </thead>
          <tbody>
            ${mandatorySkillsRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#9ca3af;">No mandatory skills data</td></tr>'}
          </tbody>
        </table>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Good-to-Have Skills Coverage</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;background:white;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;width:60px;">Status</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Skill</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Evidence</th>
            </tr>
          </thead>
          <tbody>
            ${additionalSkillsRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#9ca3af;">No additional skills data</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================
// STAGE 2: L1 SCORING REPORT
// ============================================
function generateStage2HTML(data: PipelineDetail): string {
  const stage2 = data.stage2;
  if (!stage2?.evaluation) return '<p>No L1 scoring data available.</p>';

  const evaluation = stage2.evaluation;
  const score = evaluation.score ?? 0;
  const scoreColor = score >= 8 ? '#059669' : score >= 5 ? '#d97706' : '#dc2626';
  const categories = evaluation.categories || {};

  const dimensionRows = Object.entries(categories).map(([key, value]) => {
    const numValue = Number(value);
    const maxScore = 10; // Assuming 10 max for each dimension
    const percentage = (numValue / maxScore) * 100;
    const barColor = percentage >= 80 ? '#059669' : percentage >= 50 ? '#d97706' : '#dc2626';

    return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;font-size:11px;">${esc(key)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:700;color:${barColor};">${numValue.toFixed(1)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">
          <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;">
            <div style="background:${barColor};width:${percentage.toFixed(0)}%;height:100%;border-radius:4px;"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const panelSummary = evaluation.panelSummary ? `
    <div style="margin-top:20px;background:#fff7ed;border-left:3px solid #f97316;padding:14px;border-radius:4px;">
      <h3 style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin:0 0 8px;">Panel Summary</h3>
      <p style="font-size:11px;color:#374151;line-height:1.6;margin:0;white-space:pre-wrap;">${esc(evaluation.panelSummary)}</p>
    </div>
  ` : '';

  const gapAnalysis = evaluation.gapAnalysis || evaluation.gap_analysis ? `
    <div style="margin-top:20px;background:#fef2f2;border-left:3px solid #ef4444;padding:14px;border-radius:4px;">
      <h3 style="font-size:11px;font-weight:700;color:#b91c1c;text-transform:uppercase;margin:0 0 8px;">Identified Gaps</h3>
      <p style="font-size:11px;color:#991b1b;line-height:1.6;margin:0;white-space:pre-wrap;">${esc(evaluation.gapAnalysis || evaluation.gap_analysis)}</p>
    </div>
  ` : '';

  return `
    <div class="stage-section">
      <h2 style="color:#f97316;font-size:18px;font-weight:700;margin-bottom:16px;border-bottom:2px solid #f97316;padding-bottom:8px;">Stage 2: L1 Scoring Results</h2>

      <div style="background:#f8fafc;border-left:3px solid ${scoreColor};padding:16px;margin-bottom:20px;border-radius:4px;">
        <div style="display:flex;align-items:baseline;gap:8px;">
          <span style="font-size:32px;font-weight:800;color:${scoreColor};">${score.toFixed(1)}</span>
          <span style="font-size:16px;color:#6b7280;">/ 10.0</span>
        </div>
        <p style="font-size:10px;color:#6b7280;margin:4px 0 0;">Panel Efficiency Score</p>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Dimension Scores</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;background:white;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Dimension</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;color:#6b7280;text-transform:uppercase;width:100px;">Score</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;width:200px;">Progress</th>
            </tr>
          </thead>
          <tbody>
            ${dimensionRows}
          </tbody>
        </table>
      </div>

      ${panelSummary}
      ${gapAnalysis}
    </div>
  `;
}

// ============================================
// STAGE 3: L2 SCORING REPORT
// ============================================
function generateStage3HTML(data: PipelineDetail): string {
  const stage3 = data.stage3;
  if (!stage3?.evaluation) return '<p>No L2 scoring data available.</p>';

  const evaluation = stage3.evaluation;
  const score = evaluation.score ?? 0;
  const scoreColor = score >= 8 ? '#059669' : score >= 5 ? '#d97706' : '#dc2626';
  const candidateStatus = stage3.candidateStatus || 'N/A';
  const statusColor = candidateStatus === 'Selected' ? '#059669' : '#dc2626';
  const categories = evaluation.categories || {};

  const dimensionRows = Object.entries(categories).map(([key, value]) => {
    const numValue = Number(value);
    const maxScore = 10;
    const percentage = (numValue / maxScore) * 100;
    const barColor = percentage >= 80 ? '#059669' : percentage >= 50 ? '#d97706' : '#dc2626';

    return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;font-size:11px;">${esc(key)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:700;color:${barColor};">${numValue.toFixed(1)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">
          <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;">
            <div style="background:${barColor};width:${percentage.toFixed(0)}%;height:100%;border-radius:4px;"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const panelSummary = evaluation.panelSummary ? `
    <div style="margin-top:20px;background:#eff6ff;border-left:3px solid #3b82f6;padding:14px;border-radius:4px;">
      <h3 style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;margin:0 0 8px;">Panel Summary</h3>
      <p style="font-size:11px;color:#1e3a8a;line-height:1.6;margin:0;white-space:pre-wrap;">${esc(evaluation.panelSummary)}</p>
    </div>
  ` : '';

  return `
    <div class="stage-section">
      <h2 style="color:#0ea5e9;font-size:18px;font-weight:700;margin-bottom:16px;border-bottom:2px solid #0ea5e9;padding-bottom:8px;">Stage 3: L2 Scoring Results</h2>

      <div style="display:flex;gap:16px;margin-bottom:20px;">
        <div style="flex:1;background:#f8fafc;border-left:3px solid ${scoreColor};padding:16px;border-radius:4px;">
          <div style="display:flex;align-items:baseline;gap:8px;">
            <span style="font-size:32px;font-weight:800;color:${scoreColor};">${score.toFixed(1)}</span>
            <span style="font-size:16px;color:#6b7280;">/ 10.0</span>
          </div>
          <p style="font-size:10px;color:#6b7280;margin:4px 0 0;">Panel Efficiency Score</p>
        </div>
        <div style="flex:1;background:#f8fafc;border-left:3px solid ${statusColor};padding:16px;border-radius:4px;">
          <span style="display:inline-block;padding:6px 14px;background:${statusColor};color:white;font-size:12px;font-weight:700;text-transform:uppercase;border-radius:99px;">${esc(candidateStatus)}</span>
          <p style="font-size:10px;color:#6b7280;margin:8px 0 0;">Candidate Status</p>
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Dimension Scores</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;background:white;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;">Dimension</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;color:#6b7280;text-transform:uppercase;width:100px;">Score</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;width:200px;">Progress</th>
            </tr>
          </thead>
          <tbody>
            ${dimensionRows}
          </tbody>
        </table>
      </div>

      ${panelSummary}
    </div>
  `;
}

// ============================================
// STAGE 4: CLIENT AUDIT REPORT
// ============================================
function generateStage4HTML(data: PipelineDetail): string {
  const stage4 = data.stage4;
  if (!stage4?.analysis) return '<p>No client audit data available.</p>';

  const analysis = stage4.analysis;
  const leakageColor =
    analysis.leakageVerdict === 'No Leakage' ? '#059669' :
    analysis.leakageVerdict === 'Unjustified Rejection' ? '#d97706' : '#dc2626';

  const identitySection = stage4.identityConfirmation ? `
    <div style="margin-bottom:24px;background:#f0fdf4;border-left:3px solid #10b981;padding:14px;border-radius:4px;">
      <h3 style="font-size:11px;font-weight:700;color:#065f46;text-transform:uppercase;margin:0 0 8px;">Identity Confirmation</h3>
      <p style="font-size:11px;color:#065f46;margin:0 0 6px;"><strong>Status:</strong> ${esc(stage4.identityConfirmation.confirmationStatus)}</p>
      <p style="font-size:11px;color:#047857;margin:0;line-height:1.5;">${esc(stage4.identityConfirmation.confirmationNote)}</p>
    </div>
  ` : '';

  const screeningAuditGaps = (analysis.screeningAudit?.gaps || []).map(gap =>
    `<li style="font-size:11px;color:#374151;margin:3px 0;line-height:1.5;">• ${esc(gap)}</li>`
  ).join('');

  const l1AuditStrengths = (analysis.l1Audit?.strengths || []).map(str =>
    `<li style="font-size:11px;color:#059669;margin:3px 0;line-height:1.5;">• ${esc(str)}</li>`
  ).join('');

  const l1AuditGaps = (analysis.l1Audit?.gaps || []).map(gap =>
    `<li style="font-size:11px;color:#dc2626;margin:3px 0;line-height:1.5;">• ${esc(gap)}</li>`
  ).join('');

  const l2AuditStrengths = (analysis.l2Audit?.strengths || []).map(str =>
    `<li style="font-size:11px;color:#059669;margin:3px 0;line-height:1.5;">• ${esc(str)}</li>`
  ).join('');

  const l2AuditGaps = (analysis.l2Audit?.gaps || []).map(gap =>
    `<li style="font-size:11px;color:#dc2626;margin:3px 0;line-height:1.5;">• ${esc(gap)}</li>`
  ).join('');

  const recommendationsSection = analysis.recommendations ? `
    <div style="margin-top:24px;">
      <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">Recommendations</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:white;border:1px solid #e5e7eb;padding:12px;border-radius:4px;">
          <h4 style="font-size:10px;font-weight:700;color:#7c3aed;margin:0 0 6px;text-transform:uppercase;">Screening</h4>
          <p style="font-size:11px;color:#374151;margin:0;line-height:1.5;">${esc(analysis.recommendations.screening)}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;padding:12px;border-radius:4px;">
          <h4 style="font-size:10px;font-weight:700;color:#f97316;margin:0 0 6px;text-transform:uppercase;">L1 Panel</h4>
          <p style="font-size:11px;color:#374151;margin:0;line-height:1.5;">${esc(analysis.recommendations.l1Panel)}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;padding:12px;border-radius:4px;">
          <h4 style="font-size:10px;font-weight:700;color:#0ea5e9;margin:0 0 6px;text-transform:uppercase;">L2 Panel</h4>
          <p style="font-size:11px;color:#374151;margin:0;line-height:1.5;">${esc(analysis.recommendations.l2Panel)}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;padding:12px;border-radius:4px;">
          <h4 style="font-size:10px;font-weight:700;color:#10b981;margin:0 0 6px;text-transform:uppercase;">Process</h4>
          <p style="font-size:11px;color:#374151;margin:0;line-height:1.5;">${esc(analysis.recommendations.process)}</p>
        </div>
      </div>
    </div>
  ` : '';

  return `
    <div class="stage-section">
      <h2 style="color:#10b981;font-size:18px;font-weight:700;margin-bottom:16px;border-bottom:2px solid #10b981;padding-bottom:8px;">Stage 4: Client Audit Results</h2>

      <div style="background:#f8fafc;border-left:3px solid ${leakageColor};padding:16px;margin-bottom:20px;border-radius:4px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <span style="display:inline-block;padding:4px 12px;background:${leakageColor};color:white;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:99px;">${esc(analysis.leakageVerdict)}</span>
        </div>
        <p style="font-size:11px;color:#374151;line-height:1.6;margin:0;">${esc(analysis.overallAuditSummary)}</p>
      </div>

      ${identitySection}

      <div style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">Screening Audit</h3>
        <div style="background:white;border:1px solid #e5e7eb;padding:14px;border-radius:4px;">
          <p style="font-size:11px;margin:0 0 8px;"><strong style="color:#7c3aed;">Verdict:</strong> ${esc(analysis.screeningAudit?.verdict || 'N/A')}</p>
          <p style="font-size:11px;color:#6b7280;margin:0 0 12px;line-height:1.5;">${esc(analysis.screeningAudit?.summary || '')}</p>
          ${screeningAuditGaps ? `
            <div>
              <p style="font-size:10px;font-weight:700;color:#dc2626;margin:0 0 4px;text-transform:uppercase;">Gaps Identified:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${screeningAuditGaps}</ul>
            </div>
          ` : ''}
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">L1 Audit</h3>
        <div style="background:white;border:1px solid #e5e7eb;padding:14px;border-radius:4px;">
          <p style="font-size:11px;margin:0 0 4px;"><strong style="color:#f97316;">Probing Level:</strong> ${esc(analysis.l1Audit?.probingLevel || 'N/A')} (${analysis.l1Audit?.probingLevelScore ?? 0}/10)</p>
          <p style="font-size:11px;margin:0 0 12px;"><strong style="color:#f97316;">Summary Accuracy:</strong> ${esc(analysis.l1Audit?.panelSummaryAccuracy || 'N/A')}</p>
          <p style="font-size:11px;color:#6b7280;margin:0 0 12px;line-height:1.5;">${esc(analysis.l1Audit?.summary || '')}</p>
          ${l1AuditStrengths ? `
            <div style="margin-bottom:10px;">
              <p style="font-size:10px;font-weight:700;color:#059669;margin:0 0 4px;text-transform:uppercase;">Strengths:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${l1AuditStrengths}</ul>
            </div>
          ` : ''}
          ${l1AuditGaps ? `
            <div>
              <p style="font-size:10px;font-weight:700;color:#dc2626;margin:0 0 4px;text-transform:uppercase;">Gaps:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${l1AuditGaps}</ul>
            </div>
          ` : ''}
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">L2 Audit</h3>
        <div style="background:white;border:1px solid #e5e7eb;padding:14px;border-radius:4px;">
          <p style="font-size:11px;margin:0 0 4px;"><strong style="color:#0ea5e9;">Probing Level:</strong> ${esc(analysis.l2Audit?.probingLevel || 'N/A')} (${analysis.l2Audit?.probingLevelScore ?? 0}/10)</p>
          <p style="font-size:11px;margin:0 0 12px;"><strong style="color:#0ea5e9;">Summary Accuracy:</strong> ${esc(analysis.l2Audit?.panelSummaryAccuracy || 'N/A')}</p>
          <p style="font-size:11px;color:#6b7280;margin:0 0 12px;line-height:1.5;">${esc(analysis.l2Audit?.summary || '')}</p>
          ${l2AuditStrengths ? `
            <div style="margin-bottom:10px;">
              <p style="font-size:10px;font-weight:700;color:#059669;margin:0 0 4px;text-transform:uppercase;">Strengths:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${l2AuditStrengths}</ul>
            </div>
          ` : ''}
          ${l2AuditGaps ? `
            <div>
              <p style="font-size:10px;font-weight:700;color:#dc2626;margin:0 0 4px;text-transform:uppercase;">Gaps:</p>
              <ul style="margin:0;padding-left:0;list-style:none;">${l2AuditGaps}</ul>
            </div>
          ` : ''}
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Rejection Reason Validity</h3>
        <div style="background:white;border:1px solid #e5e7eb;padding:14px;border-radius:4px;">
          <p style="font-size:11px;margin:0 0 4px;"><strong>Verdict:</strong> ${esc(analysis.rejectionReasonValidity || 'N/A')}</p>
          <p style="font-size:11px;color:#6b7280;margin:0;line-height:1.5;">${esc(analysis.rejectionReasonAnalysis || '')}</p>
        </div>
      </div>

      ${recommendationsSection}
    </div>
  `;
}

// ============================================
// OVERALL REPORT GENERATOR
// ============================================
function generateOverallReportHTML(data: PipelineDetail): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const completedStagesHTML = [
    { id: 'stage1', label: 'Screening', generator: generateStage1HTML },
    { id: 'stage2', label: 'L1 Scoring', generator: generateStage2HTML },
    { id: 'stage3', label: 'L2 Scoring', generator: generateStage3HTML },
    { id: 'stage4', label: 'Client Audit', generator: generateStage4HTML }
  ]
    .filter(stage => data.completedStages?.includes(stage.id))
    .map(stage => stage.generator(data))
    .join('<div style="page-break-before:always;margin-top:40px;"></div>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Candidate Pipeline Report — ${esc(data.candidateName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; padding: 28px 32px; font-size: 12px; line-height: 1.5; }
    .header-bar { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #6366f1; padding-bottom:12px; margin-bottom:20px; }
    .meta-grid { display:flex; gap:24px; flex-wrap:wrap; margin-bottom:20px; }
    .meta-item { font-size:11px; }
    .footer { margin-top:40px; padding-top:12px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-size:9px; color:#9ca3af; }
    .stage-section { margin-bottom: 40px; page-break-inside: avoid; }
    @media print {
      body { padding: 20px; }
      .stage-section { page-break-before: auto; page-break-after: auto; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div style="display:flex; align-items:center; gap:12px;">
      <img src="${window.location.origin}/INDIUM LOGO.png" alt="Indium Logo" style="height:32px; object-fit:contain;" onerror="this.style.display='none'" />
      <div>
        <h1 style="font-size:18px;font-weight:700;color:#111827;">Candidate Pipeline Report</h1>
        <p style="font-size:10px;color:#6b7280;margin-top:2px;">Comprehensive Evaluation Summary</p>
      </div>
    </div>
    <span style="font-size:10px;color:#9ca3af">${dateStr} · ${timeStr}</span>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><span style="color:#6b7280;">Candidate: </span><strong style="font-size:13px;">${esc(data.candidateName)}</strong></div>
    <div class="meta-item"><span style="color:#6b7280;">Job ID: </span><strong>${esc(data.jobId)}</strong></div>
    ${data.panelName ? `<div class="meta-item"><span style="color:#6b7280;">Panel: </span><strong>${esc(data.panelName)}</strong></div>` : ''}
    ${data.panelEmail ? `<div class="meta-item"><span style="color:#6b7280;">Email: </span><strong>${esc(data.panelEmail)}</strong></div>` : ''}
    <div class="meta-item"><span style="color:#6b7280;">Completed Stages: </span><strong>${data.completedStages?.length || 0} / 4</strong></div>
  </div>

  ${completedStagesHTML || '<p style="color:#9ca3af;text-align:center;padding:40px 0;">No stages completed yet.</p>'}

  <div class="footer">
    <span>Generated by Panel Pulse AI · ${window.location.host}</span>
    <span>${dateStr} ${timeStr}</span>
  </div>
</body>
</html>`;
}

// ============================================
// MAIN REPORT GENERATOR FUNCTION
// ============================================
export async function generateReport(options: ReportGeneratorOptions): Promise<void> {
  const { data, stageId = 'overall', format } = options;

  let html: string;
  let filename: string;

  if (stageId === 'overall') {
    html = generateOverallReportHTML(data);
    filename = `${data.candidateName}-${data.jobId}-Overall-Report`;
  } else {
    const stageGenerators = {
      stage1: generateStage1HTML,
      stage2: generateStage2HTML,
      stage3: generateStage3HTML,
      stage4: generateStage4HTML
    };

    const stageLabels = {
      stage1: 'Screening',
      stage2: 'L1-Scoring',
      stage3: 'L2-Scoring',
      stage4: 'Client-Audit'
    };

    const stageHTML = stageGenerators[stageId](data);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${stageLabels[stageId]} Report — ${esc(data.candidateName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; padding: 28px 32px; font-size: 12px; line-height: 1.5; }
    .header-bar { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #6366f1; padding-bottom:12px; margin-bottom:20px; }
    .meta-grid { display:flex; gap:24px; flex-wrap:wrap; margin-bottom:20px; }
    .meta-item { font-size:11px; }
    .footer { margin-top:40px; padding-top:12px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-size:9px; color:#9ca3af; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div style="display:flex; align-items:center; gap:12px;">
      <img src="${window.location.origin}/INDIUM LOGO.png" alt="Indium Logo" style="height:32px; object-fit:contain;" onerror="this.style.display='none'" />
      <div>
        <h1 style="font-size:18px;font-weight:700;color:#111827;">${stageLabels[stageId]} Report</h1>
        <p style="font-size:10px;color:#6b7280;margin-top:2px;">${esc(data.candidateName)} — ${esc(data.jobId)}</p>
      </div>
    </div>
    <span style="font-size:10px;color:#9ca3af">${dateStr} · ${timeStr}</span>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><span style="color:#6b7280;">Candidate: </span><strong style="font-size:13px;">${esc(data.candidateName)}</strong></div>
    <div class="meta-item"><span style="color:#6b7280;">Job ID: </span><strong>${esc(data.jobId)}</strong></div>
    ${data.panelName ? `<div class="meta-item"><span style="color:#6b7280;">Panel: </span><strong>${esc(data.panelName)}</strong></div>` : ''}
  </div>

  ${stageHTML}

  <div class="footer">
    <span>Generated by Panel Pulse AI · ${window.location.host}</span>
    <span>${dateStr} ${timeStr}</span>
  </div>
</body>
</html>`;

    filename = `${data.candidateName}-${data.jobId}-${stageLabels[stageId]}`;
  }

  if (format === 'html') {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    // PDF generation
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

      const pxPerPage = (canvasWidth * pdfHeight) / pdfWidth;
      const totalPages = Math.ceil(canvasHeight / pxPerPage);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();

        const srcY = i * pxPerPage;
        const srcH = Math.min(pxPerPage, canvasHeight - srcY);

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

          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text(`Page ${i + 1} of ${totalPages}`, pdfWidth - 25, pdfHeight - 5);
        }
      }

      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error('PDF Export failed:', error);
      throw error;
    } finally {
      document.body.removeChild(container);
    }
  }
}
