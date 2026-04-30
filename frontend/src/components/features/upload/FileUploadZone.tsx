import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Cloud, Upload } from 'lucide-react';

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function FileUploadZone({ onFilesSelected, disabled }: FileUploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesSelected(acceptedFiles);
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt', '.csv'],
      'application/json': ['.json'],
    },
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
        isDragActive
          ? 'border-primary bg-primary/10 scale-105'
          : 'border-white/[0.15] hover:border-primary/50 bg-white/[0.02]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />

      <div className="flex flex-col items-center gap-3">
        {isDragActive ? (
          <Cloud className="w-12 h-12 text-primary animate-bounce" />
        ) : (
          <Upload className="w-12 h-12 text-text-muted" />
        )}

        <div>
          <p className="text-text-primary font-medium">
            {isDragActive ? 'Drop files here' : 'Drag files here or click to browse'}
          </p>
          <p className="text-xs text-text-muted mt-1">Supported: CSV, JSON, TXT files</p>
        </div>
      </div>
    </div>
  );
}
