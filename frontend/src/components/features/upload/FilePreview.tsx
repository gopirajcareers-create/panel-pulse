import type { FileData } from '@/types/upload.types';
import { File, X } from 'lucide-react';
import { formatDate } from '@/lib/utils/formatters';

interface FilePreviewProps {
  files: Map<string, FileData>;
  onRemove: (type: 'jd' | 'l1' | 'l2') => void;
}

export function FilePreview({ files, onRemove }: FilePreviewProps) {
  if (files.size === 0) {
    return null;
  }

  const fileArray = Array.from(files.values());

  return (
    <div className="bg-bg-card rounded-lg border border-white/[0.07] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.07] bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-text-primary">Selected Files ({files.size}/3)</h3>
      </div>

      <div className="divide-y divide-white/[0.07]">
        {fileArray.map((file) => (
          <div key={file.type} className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <File className="w-5 h-5 text-text-muted flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
                <p className="text-xs text-text-muted">
                  {file.type.toUpperCase()} · {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>

            <button
              onClick={() => onRemove(file.type)}
              className="ml-2 p-2 rounded-lg hover:bg-score-poor/20 text-text-muted hover:text-score-poor transition-colors flex-shrink-0"
              aria-label={`Remove ${file.type} file`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 bg-white/[0.02] text-xs text-text-muted">
        {files.size === 3 ? (
          <p className="text-score-good">✓ All files ready for evaluation</p>
        ) : (
          <p>Please select {3 - files.size} more file(s)</p>
        )}
      </div>
    </div>
  );
}
