import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning';
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger'
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const variantStyles = {
    danger: {
      icon: 'text-red-400',
      button: 'bg-red-600 hover:bg-red-700',
      border: 'border-red-500/30'
    },
    warning: {
      icon: 'text-orange-400',
      button: 'bg-orange-600 hover:bg-orange-700',
      border: 'border-orange-500/30'
    }
  };

  const styles = variantStyles[variant];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-labelledby="dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative w-full max-w-md bg-slate-800 border ${styles.border} rounded-xl shadow-2xl outline-none`}
      >
        <div className="flex items-start gap-3 px-6 py-5">
          <AlertTriangle className={`w-6 h-6 ${styles.icon} flex-shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0">
            <h2 id="dialog-title" className="text-lg font-semibold text-text-primary mb-2">
              {title}
            </h2>
            <p className="text-sm text-text-muted leading-relaxed">
              {message}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-surface transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-white/5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-text-primary hover:bg-white/5 transition-colors font-medium"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg ${styles.button} text-white transition-colors font-semibold`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
