import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { panelApi } from '@/lib/api/panel.api';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ArrowLeft, UserCircle, Target, TrendingUp, Calendar, Download, Mail, Fingerprint, FileText } from 'lucide-react';
import {
  Tooltip,
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';

interface PanelProfileData {
  panelName: string;
  employeeId: string;
  email: string;
  totalEvaluations: number;
  averageScore: number;
  dimensionAverages: Record<string, number>;
  history: Array<{
    id: string;
    jobId: string;
    candidateName: string;
    score: number;
    date: string;
  }>;
}

export default function PanelProfilePage() {
  const { panelName } = useParams<{ panelName: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PanelProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!panelName) return;
    panelApi.getPanelProfile(panelName).then((res) => {
      if (res.success) {
        setData(res.data);
      }
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoading(false);
    });
  }, [panelName]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 overflow-y-auto bg-bg-base p-8 flex items-center justify-center">
          <div className="text-text-muted">Loading profile data...</div>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="flex-1 overflow-y-auto bg-bg-base p-8">
          <div className="text-center text-text-muted py-12">Profile not found.</div>
        </div>
      </AppShell>
    );
  }

  function generateReportHTML(): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const historyRows = data!.history.map(h => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #f3f4f6;">${h.jobId}</td>
        <td style="padding:10px;border-bottom:1px solid #f3f4f6;">${h.candidateName}</td>
        <td style="padding:10px;border-bottom:1px solid #f3f4f6;text-align:right"><strong style="color:#6366f1">${h.score.toFixed(1)}</strong></td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Panelist Report — ${data!.panelName}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1f2937; background: #fff; line-height: 1.5; }
    .header { border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 25px; }
    .title { font-size: 24px; font-weight: bold; color: #111827; }
    .meta-container { display: flex; gap: 20px; margin-bottom: 30px; }
    .meta-box { flex: 1; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .meta-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 8px; }
    .meta-value { font-size: 15px; font-weight: 600; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #f1f5f9; padding: 12px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
    .section-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-top: 30px; margin-bottom: 15px; border-left: 4px solid #6366f1; padding-left: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
      <img src="${window.location.origin}/INDIUM LOGO.png" alt="Indium Logo" style="height:35px; object-fit:contain;" />
      <div style="text-align: right; font-size: 10px; color: #94a3b8;">${dateStr} · ${timeStr}</div>
    </div>
    <div class="title">Panel Member Profile: ${data!.panelName}</div>
  </div>
  
  <div class="meta-container">
    <div class="meta-box">
      <div class="meta-label">Employee Details</div>
      <div class="meta-value">ID: ${data!.employeeId}</div>
      <div class="meta-value" style="font-size: 13px; font-weight: 400; margin-top: 4px;">${data!.email}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Performance Overview</div>
      <div class="meta-value">Interviews: ${data!.totalEvaluations}</div>
      <div class="meta-value" style="color: #6366f1; font-size: 20px; margin-top: 4px;">Avg Score: ${data!.averageScore.toFixed(1)} / 10</div>
    </div>
  </div>

  <div class="section-title">Evaluation History</div>
  <table>
    <thead>
      <tr>
        <th>Job ID / Reference</th>
        <th>Candidate Name</th>
        <th style="text-align:right">Panel Score</th>
      </tr>
    </thead>
    <tbody>
      ${historyRows}
    </tbody>
  </table>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center;">
    Generated by Panel Pulse AI · ${window.location.host}
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
    a.download = `panelist-profile-${data!.panelName.replace(/\s+/g, '-')}-${now.toISOString().slice(0, 10)}.html`;
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
      position: 'absolute', left: '-9999px', top: '0', width: '800px', backgroundColor: '#ffffff', color: '#1f2937', padding: '40px'
    });
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: 800
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      // Calculate pixels per page on the canvas based on A4 aspect ratio
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
          
          // Page Footer
          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text(`Page ${i + 1} of ${totalPages}`, pdfWidth - 30, pdfHeight - 10);
        }
      }
      
      pdf.save(`panelist-profile-${data!.panelName.replace(/\s+/g, '-')}-${now.toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('PDF Export failed:', error);
    } finally {
      document.body.removeChild(container);
    }
  };

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-bg-base p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex items-center justify-between">
            <button 
              onClick={() => navigate('/panels')}
              className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Directory
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportHTML}
                className="flex items-center gap-2 text-sm bg-white/5 text-text-primary hover:bg-white/10 px-4 py-2 rounded-lg border border-white/10 transition-colors font-medium"
              >
                <Download className="w-4 h-4 text-indigo-400" />
                Export HTML
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 text-sm bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 px-4 py-2 rounded-lg border border-indigo-500/20 transition-colors font-medium"
              >
                <FileText className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>
          {/* Rest of the profile remains same ... */}
          <div className="flex items-start justify-between bg-bg-card border border-white/[0.06] p-6 rounded-xl">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-2xl uppercase border border-indigo-500/30">
                {data.panelName.substring(0, 2)}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
                  {data.panelName}
                </h1>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="flex items-center gap-1.5 text-text-muted">
                    <Fingerprint className="w-3.5 h-3.5" />
                    {data.employeeId}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-white/20"></span>
                  <span className="flex items-center gap-1.5 text-text-muted">
                    <Mail className="w-3.5 h-3.5" />
                    {data.email}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-6 text-center items-center">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Total Interviews</p>
                <p className="text-2xl font-bold text-text-primary">{data.totalEvaluations}</p>
              </div>
              <div className="w-px h-10 bg-white/[0.06]"></div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Avg Score</p>
                <div className="flex items-baseline gap-1 justify-center">
                  <span className={`text-2xl font-bold ${data.averageScore >= 8 ? 'text-emerald-400' : 'text-orange-400'}`}>{data.averageScore.toFixed(1)}</span>
                  <span className="text-sm text-text-muted">/ 10</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-bg-card rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="p-5 border-b border-white/[0.06] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-text-primary">Evaluation History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-text-muted uppercase bg-white/[0.02] border-b border-white/[0.06]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Candidate ID</th>
                    <th className="px-6 py-4 font-semibold">Candidate Name</th>
                    <th className="px-6 py-4 font-semibold text-right">Panel Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {data.history.map((h, i) => {
                    const rowCat = h.score >= 8 ? 'text-emerald-400' : h.score >= 5 ? 'text-orange-400' : 'text-red-400';
                    return (
                      <tr key={h.id || i} className="hover:bg-white/[0.01] transition-colors">
                        <td className="px-6 py-4 font-medium text-text-primary">
                          <button
                            onClick={() => navigate(`/results/${h.id}`)}
                            className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors focus:outline-none"
                            title="View Full Report"
                          >
                            {h.jobId || 'N/A'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-text-secondary">
                          {h.candidateName || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-semibold ${rowCat}`}>{h.score.toFixed(1)}</span>
                          <span className="text-text-muted text-xs ml-1">/ 10</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </div>
    </AppShell>
  );
}
