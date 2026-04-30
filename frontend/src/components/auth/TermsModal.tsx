import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface TermsModalProps {
  onClose: () => void;
}

export default function TermsModal({ onClose }: TermsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Trap focus inside modal
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-label="Terms and Conditions"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-bg-base border border-border-primary rounded-2xl shadow-2xl
                   flex flex-col max-h-[80vh] outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary flex-shrink-0">
          <h2 className="text-base font-semibold text-text-primary">Terms &amp; Conditions</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-surface transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 text-sm text-text-muted leading-relaxed">
          <p className="text-text-secondary font-medium">
            Effective Date: January 1, 2025 &nbsp;·&nbsp; Version 1.0
          </p>

          <section className="space-y-2">
            <h3 className="text-text-primary font-semibold">1. Authorized Use Only</h3>
            <p>
              Panel Pulse AI is an internal tool provided exclusively to authorized Indium Software
              employees. Access is granted solely for legitimate business purposes related to
              interview panel management and candidate evaluation. Sharing credentials or granting
              access to external parties is strictly prohibited.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-text-primary font-semibold">2. Data Privacy &amp; Confidentiality</h3>
            <p>
              All candidate data, evaluation records, and AI-generated insights processed within
              Panel Pulse AI are confidential. You must not export, copy, or share any personal
              data outside of authorized workflows. Data is stored and processed in accordance with
              Indium's data protection policies and applicable privacy regulations.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-text-primary font-semibold">3. Acceptable Use</h3>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Use Panel Pulse AI to discriminate or bias hiring decisions unlawfully.</li>
              <li>Attempt to reverse-engineer, scrape, or exploit the underlying models or data.</li>
              <li>Upload or submit data that violates third-party intellectual property rights.</li>
              <li>Circumvent any access controls or security measures of the platform.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-text-primary font-semibold">4. AI-Generated Content</h3>
            <p>
              AI suggestions and evaluations are decision-support tools only. Final hiring and
              evaluation decisions remain the responsibility of the human panelist. Indium makes no
              guarantees regarding the accuracy or completeness of AI-generated outputs.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-text-primary font-semibold">5. Consequences of Misuse</h3>
            <p>
              Violation of these terms may result in immediate access revocation, disciplinary
              action in accordance with Indium's HR policies, and potential legal liability for
              unauthorized disclosure of confidential data.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-text-primary font-semibold">6. Data Retention</h3>
            <p>
              Evaluation records and associated candidate data are retained for a period defined by
              Indium's data governance policy. You may request deletion of your account data by
              contacting the system administrator.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-text-primary font-semibold">7. Changes to These Terms</h3>
            <p>
              Indium reserves the right to update these terms at any time. Continued use of Panel
              Pulse AI after notification of changes constitutes acceptance of the revised terms.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-primary flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-accent-primary hover:bg-accent-secondary text-white font-semibold text-sm
                       rounded-xl py-2.5 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
