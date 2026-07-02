import React, { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { generateReport } from '@/lib/utils/reportGenerator';
import type { PipelineDetail } from '@/lib/api/pipeline.api';
import toast from 'react-hot-toast';

interface ReportDownloadButtonProps {
  data: PipelineDetail;
  stageId?: 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'overall';
  label?: string;
  variant?: 'primary' | 'secondary' | 'compact';
  showBothFormats?: boolean;
}

export function ReportDownloadButton({
  data,
  stageId = 'overall',
  label,
  variant = 'primary',
  showBothFormats = true
}: ReportDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const getDefaultLabel = () => {
    if (stageId === 'overall') return 'Download Report';
    const stageLabels = {
      stage1: 'Screening Report',
      stage2: 'L1 Report',
      stage3: 'L2 Report',
      stage4: 'Audit Report'
    };
    return stageLabels[stageId];
  };

  const displayLabel = label || getDefaultLabel();

  const handleDownload = async (format: 'html' | 'pdf') => {
    setDownloading(true);
    try {
      await generateReport({ data, stageId, format });
      toast.success(`${format.toUpperCase()} report downloaded successfully`);
    } catch (error) {
      console.error('Report generation failed:', error);
      toast.error(`Failed to generate ${format.toUpperCase()} report`);
    } finally {
      setDownloading(false);
    }
  };

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleDownload('html')}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/40 hover:bg-slate-700/40 text-text-primary text-xs font-medium rounded-lg border border-slate-700/50 transition-all disabled:opacity-50"
          title="Download HTML Report"
        >
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          HTML
        </button>
        <button
          onClick={() => handleDownload('pdf')}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-medium rounded-lg border border-indigo-500/20 transition-all disabled:opacity-50"
          title="Download PDF Report"
        >
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          PDF
        </button>
      </div>
    );
  }

  if (showBothFormats) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleDownload('html')}
          disabled={downloading}
          className={`inline-flex items-center gap-2 px-4 py-2 ${
            variant === 'primary'
              ? 'bg-slate-800/40 hover:bg-slate-700/40 text-text-primary border-slate-700/50'
              : 'bg-white/[0.03] hover:bg-white/[0.06] text-text-primary border-white/[0.05]'
          } text-sm font-medium rounded-lg border transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50`}
          title="Download Report as HTML"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Download className="w-4 h-4 text-indigo-400" />}
          Export HTML
        </button>

        <button
          onClick={() => handleDownload('pdf')}
          disabled={downloading}
          className={`inline-flex items-center gap-2 px-4 py-2 ${
            variant === 'primary'
              ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/20'
              : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/20'
          } text-sm font-medium rounded-lg border transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50`}
          title="Download Report as PDF"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <FileText className="w-4 h-4 text-indigo-400" />}
          Export PDF
        </button>
      </div>
    );
  }

  // Single button with dropdown or default to PDF
  return (
    <button
      onClick={() => handleDownload('pdf')}
      disabled={downloading}
      className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
      title={displayLabel}
    >
      {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {displayLabel}
    </button>
  );
}
