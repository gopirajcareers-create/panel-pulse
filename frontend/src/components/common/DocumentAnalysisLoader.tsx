import React, { useState, useEffect } from 'react';
import Lottie from 'lottie-react';

interface DocumentAnalysisLoaderProps {
  /** Current stage of evaluation (optional) */
  stage?: 'extracting' | 'analyzing' | 'validating' | 'scoring';
  /** Progress percentage (0-100) */
  progress?: number;
  /** Show estimated time remaining */
  showTimeEstimate?: boolean;
  /** Custom message to display */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const STAGE_MESSAGES = {
  extracting: 'Extracting JD requirements...',
  analyzing: 'Analyzing interview transcript...',
  validating: 'Validating responses against L2...',
  scoring: 'Computing final panel score...',
};

const TIPS = [
  'Our AI analyzes 50+ dimensions to ensure fair panel evaluation',
  'Each evaluation considers technical skills, behavioral traits, and communication quality',
  'The system cross-references L1 transcripts with L2 rejection reasons for accuracy',
  'Panel scores are calibrated using industry-standard frameworks',
  'Our LLM processes thousands of data points to generate comprehensive insights',
];

export function DocumentAnalysisLoader({
  stage,
  progress,
  showTimeEstimate = true,
  message,
  size = 'md',
}: DocumentAnalysisLoaderProps) {
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);

  // Rotate tips every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Calculate estimated time remaining based on progress
  useEffect(() => {
    if (progress !== undefined && progress > 0 && progress < 100) {
      // Assume average total time is 120 seconds (2 minutes)
      const avgTotalTime = 120;
      const remaining = Math.ceil((avgTotalTime * (100 - progress)) / 100);
      setEstimatedTime(remaining);
    } else {
      setEstimatedTime(null);
    }
  }, [progress]);

  const sizeClasses = {
    sm: 'w-32 h-32',
    md: 'w-48 h-48',
    lg: 'w-64 h-64',
  };

  // Fetch animation from public folder
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    fetch('/document-analysis.json')
      .then((res) => res.json())
      .then((data) => setAnimationData(data))
      .catch((err) => console.error('Failed to load animation:', err));
  }, []);

  const displayMessage = message || (stage ? STAGE_MESSAGES[stage] : 'Processing panel evaluation...');

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8">
      {/* Lottie Animation */}
      <div className={`${sizeClasses[size]} relative`}>
        {animationData ? (
          <Lottie
            animationData={animationData}
            loop={true}
            autoplay={true}
            style={{
              width: '100%',
              height: '100%',
            }}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Status Message */}
      <div className="text-center space-y-2">
        <p className="text-base font-medium text-text-primary animate-pulse">
          {displayMessage}
        </p>

        {/* Progress Bar */}
        {progress !== undefined && (
          <div className="w-80 max-w-full mx-auto space-y-2">
            <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent-primary transition-all duration-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-xs text-text-muted">
              <span>{progress}% complete</span>
              {showTimeEstimate && estimatedTime !== null && (
                <span>~{estimatedTime}s remaining</span>
              )}
            </div>
          </div>
        )}

        {/* Stage Indicators */}
        {stage && (
          <div className="flex items-center justify-center gap-3 mt-4">
            {(['extracting', 'analyzing', 'validating', 'scoring'] as const).map((s, idx) => {
              const isCurrent = s === stage;
              const isPast = ['extracting', 'analyzing', 'validating', 'scoring'].indexOf(s) <
                ['extracting', 'analyzing', 'validating', 'scoring'].indexOf(stage);

              return (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      isCurrent
                        ? 'bg-accent-primary scale-150 animate-pulse'
                        : isPast
                        ? 'bg-accent-success'
                        : 'bg-white/20'
                    }`}
                  />
                  {idx < 3 && (
                    <div
                      className={`w-6 h-0.5 transition-all duration-300 ${
                        isPast ? 'bg-accent-success' : 'bg-white/20'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Rotating Tips */}
        <div className="mt-6 max-w-md mx-auto">
          <div className="flex items-start gap-2 p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
            <span className="text-lg shrink-0">💡</span>
            <p className="text-xs text-text-muted leading-relaxed animate-pulse">
              {TIPS[currentTipIndex]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
