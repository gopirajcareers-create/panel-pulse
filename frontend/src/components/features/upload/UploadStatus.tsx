import { useUploadStore } from '@/lib/stores/upload.store';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';

export function UploadStatus() {
  const { uploadStatus, uploadProgress, uploadMessage } = useUploadStore();

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
            {uploadStatus === 'uploading' && 'Processing...'}
            {uploadStatus === 'success' && 'Evaluation Complete'}
            {uploadStatus === 'error' && 'Error'}
          </p>
          <p className="text-xs text-text-muted">{uploadMessage}</p>
        </div>
      </div>

      {/* Progress Bar */}
      {uploadStatus === 'uploading' && (
        <div className="space-y-2">
          <div className="w-full bg-white/[0.07] rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-text-muted text-right">{uploadProgress}%</p>
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
