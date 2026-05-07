import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface ModerationFlag {
  detected: boolean;
  evidence: string[];
  severity: 'none' | 'low' | 'medium' | 'high';
}

interface ModerationData {
  job_id?: string;
  flags: {
    age?: ModerationFlag;
    marital_status?: ModerationFlag;
    religion?: ModerationFlag;
    gender?: ModerationFlag;
    race_ethnicity?: ModerationFlag;
    disability?: ModerationFlag;
    language_region?: ModerationFlag;
  };
  overall_compliance: 'pass' | 'warning' | 'fail';
  summary: string;
}

interface Props {
  moderation: ModerationData | null;
  loading?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  age: 'Age-related Questions',
  marital_status: 'Marital Status',
  religion: 'Religion',
  gender: 'Gender/Sexual Orientation',
  race_ethnicity: 'Race/Ethnicity',
  disability: 'Disability/Health',
  language_region: 'Language/Region'
};

export function ModerationCard({ moderation, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-white/5 rounded w-1/3"></div>
          <div className="h-4 bg-white/5 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!moderation) {
    return (
      <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6">
        <div className="flex items-center gap-3">
          <Info className="w-5 h-5 text-text-muted" />
          <p className="text-sm text-text-muted">
            Moderation analysis not available for this evaluation.
          </p>
        </div>
      </div>
    );
  }

  const { flags, overall_compliance } = moderation;

  // Count detected issues by severity
  const detectedFlags = Object.entries(flags).filter(([_, flag]) => flag?.detected);
  const hasIssues = detectedFlags.length > 0;

  // Determine overall status
  const getStatusColor = (compliance: string) => {
    switch (compliance) {
      case 'pass':
        return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
      case 'warning':
        return 'text-orange-400 bg-orange-500/15 border-orange-500/30';
      case 'fail':
        return 'text-red-400 bg-red-500/15 border-red-500/30';
      default:
        return 'text-text-muted bg-white/5 border-white/10';
    }
  };

  const getStatusIcon = (compliance: string) => {
    switch (compliance) {
      case 'pass':
        return <CheckCircle className="w-5 h-5" />;
      case 'warning':
      case 'fail':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  return (
    <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-text-primary">Interview Moderation</h3>
          <p className="text-sm text-text-muted">
            Screening for potentially discriminatory questions
          </p>
        </div>
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getStatusColor(
            overall_compliance
          )}`}
        >
          {getStatusIcon(overall_compliance)}
          <span className="uppercase">{overall_compliance}</span>
        </div>
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(flags).map(([category, flag]) => {
          if (!flag) return null;

          const isDetected = flag.detected;
          const bgColor = isDetected ? 'bg-red-500/10' : 'bg-emerald-500/10';
          const borderColor = isDetected ? 'border-red-500/30' : 'border-emerald-500/30';
          const textColor = isDetected ? 'text-red-300' : 'text-emerald-300';

          return (
            <div
              key={category}
              className={`px-4 py-3 rounded-lg border ${bgColor} ${borderColor} group relative`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">
                  {CATEGORY_LABELS[category] || category}
                </span>
                <span className={`text-sm font-bold ${textColor}`}>
                  {isDetected ? 'YES' : 'NO'}
                </span>
              </div>

              {/* Tooltip for detected issues */}
              {isDetected && flag.evidence && flag.evidence.length > 0 && (
                <div className="absolute left-0 top-full mt-2 w-80 p-3 bg-[#111118] border border-red-500/30 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <p className="text-xs font-semibold text-red-400 mb-2">Evidence Found:</p>
                  <ul className="space-y-1.5 text-xs text-text-secondary max-h-40 overflow-y-auto">
                    {flag.evidence.slice(0, 3).map((quote, idx) => (
                      <li key={idx} className="italic">
                        &quot;{quote}&quot;
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-text-muted mt-2">
                    Severity: <span className="font-semibold capitalize">{flag.severity}</span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {hasIssues && (
        <div className="pt-4 border-t border-white/[0.06]">
          <div className="flex items-start gap-3 p-4 bg-orange-500/5 border border-orange-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-orange-300">Issues Detected</p>
              <p className="text-xs text-text-secondary leading-relaxed">
                {moderation.summary || 'One or more potentially discriminatory questions were detected in the interview transcript. Please review the evidence and ensure compliance with hiring regulations.'}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {detectedFlags.map(([category, flag]) => (
                  <span
                    key={category}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium bg-red-500/15 text-red-300 rounded border border-red-500/30"
                  >
                    {CATEGORY_LABELS[category] || category}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compliant message */}
      {!hasIssues && overall_compliance === 'pass' && (
        <div className="pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-sm text-text-secondary">
              No discriminatory questions detected. The interview appears to be compliant with hiring regulations.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
