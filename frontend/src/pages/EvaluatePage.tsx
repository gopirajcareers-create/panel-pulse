import { AppShell } from '@/components/layout/AppShell';
import { BulkUploadForm } from '@/components/features/upload/BulkUploadForm';
import { ExtractDetailsForm } from '@/components/features/extract/ExtractDetailsForm';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function EvaluatePage() {
  const navigate = useNavigate();
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-bg-base p-8">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-text-primary mb-2">Evaluate Panel</h1>
            <p className="text-text-muted">
              Upload your JD, L1 transcript, and L2 rejection CSV files — the system will
              automatically evaluate every panel across all job IDs and store results in one go.
            </p>
          </div>

          {/* Extract Details Section */}
          <ExtractDetailsForm />
          
          {/* One-touch bulk upload */}
          <BulkUploadForm />
        </div>
      </div>
    </AppShell>
  );
}
