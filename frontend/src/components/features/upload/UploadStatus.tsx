import { useUploadStore } from '@/lib/stores/upload.store';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useEffect, useState } from 'react';

const THINKING_STEPS = [
  'Reading interview transcripts...',
  'Analyzing panel behavior patterns...',
  'Evaluating technical depth & probing...',
  'Cross-referencing L2 rejection reasons...',
  'Computing competency scores...',
  'Generating evaluation summary...',
];

export function UploadStatus() {
  const { uploadStatus, uploadProgress, uploadMessage } = useUploadStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [stepVisible, setStepVisible] = useState(true);

  useEffect(() => {
    if (uploadStatus !== 'uploading') {
      setStepIndex(0);
      setStepVisible(true);
      return;
    }
    const interval = setInterval(() => {
      setStepVisible(false);
      setTimeout(() => {
        setStepIndex(i => (i + 1) % THINKING_STEPS.length);
        setStepVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, [uploadStatus]);

  if (uploadStatus === 'idle') {
    return null;
  }

  return (
    <div className="bg-bg-card rounded-lg border border-white/[0.07] p-6 space-y-4">
      {/* Status Header */}
      <div className="flex items-center gap-3">
        {uploadStatus === 'uploading' && (
          <Loader className="w-5 h-5 text-primary animate-spin" />
        )}
        {uploadStatus === 'success' && <CheckCircle className="w-5 h-5 text-score-good" />}
        {uploadStatus === 'error' && <AlertCircle className="w-5 h-5 text-score-poor" />}

        <div>
          <p className="text-sm font-medium text-text-primary">
            {uploadStatus === 'uploading' && 'Evaluating Panel...'}
            {uploadStatus === 'success' && 'Evaluation Complete'}
            {uploadStatus === 'error' && 'Error'}
          </p>
          <p className="text-xs text-text-muted">{uploadMessage}</p>
        </div>
      </div>

      {/* Thinking Steps */}
      {uploadStatus === 'uploading' && (
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            {THINKING_STEPS.map((step, i) => {
              const isDone = i < stepIndex;
              const isActive = i === stepIndex;
              return (
                <div
                  key={step}
                  className={`flex items-center gap-2 text-xs transition-all duration-300 ${
                    isDone ? 'text-score-good' : isActive ? 'text-text-primary' : 'text-text-muted/40'
                  }`}
                >
                  <span className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                    {isDone ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : isActive ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
                    )}
                  </span>
                  <span
                    className={`transition-opacity duration-300 ${
                      isActive ? (stepVisible ? 'opacity-100' : 'opacity-0') : 'opacity-100'
                    }`}
                  >
                    {step}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="space-y-1 pt-1">
            <div className="w-full bg-white/[0.07] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-text-muted text-right">{uploadProgress}%</p>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {uploadStatus === 'success' && (
        <div className="bg-score-good/10 border border-score-good/30 rounded p-3">
          <p className="text-sm text-score-good">
            Your panel efficiency evaluation has been completed successfully. Redirecting to results...
          </p>
        </div>
      )}

      {uploadStatus === 'error' && (
        <div className="bg-score-poor/10 border border-score-poor/30 rounded p-3">
          <p className="text-sm text-score-poor">{uploadMessage}</p>
        </div>
      )}
    </div>
  );
}
