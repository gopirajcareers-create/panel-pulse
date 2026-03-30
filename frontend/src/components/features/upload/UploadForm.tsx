import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { FileUploadZone } from './FileUploadZone';
import { FilePreview } from './FilePreview';
import { useFileUpload } from '@/hooks/use-file-upload';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { panelApi } from '@/lib/api/panel.api';

export function UploadForm() {
  const [jobId, setJobId] = useState('');
  const [panelName, setPanelName] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [alreadyEvaluatedMessage, setAlreadyEvaluatedMessage] = useState('');
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const { handleFilesSelected, removeFileByType, submitEvaluation, isUploading, files } = useFileUpload();

  const isComplete = files.size === 3 && jobId.trim().length > 0 && panelName.trim().length > 0 && candidateName.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isComplete) return;

    // Check if this evaluation already exists
    setCheckingDuplicate(true);
    const checkResult = await panelApi.checkExisting(jobId.trim(), panelName.trim(), candidateName.trim());
    setCheckingDuplicate(false);

    if (checkResult.exists) {
      setAlreadyEvaluatedMessage(
        `This interview (${jobId} - ${panelName} - ${candidateName}) is already evaluated. The cached result will be displayed.`
      );
    } else {
      setAlreadyEvaluatedMessage('');
    }

    // Continue with submission (will be cached if exists)
    await submitEvaluation(jobId, panelName, candidateName);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Job ID Input */}
      <div>
        <label htmlFor="jobId" className="block text-sm font-medium text-text-primary mb-2">
          Job Interview ID
        </label>
        <Input
          id="jobId"
          type="text"
          placeholder="e.g. JD12778"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          disabled={isUploading}
          aria-label="Job Interview ID"
        />
      </div>

      {/* Panel Name Input */}
      <div>
        <label htmlFor="panelName" className="block text-sm font-medium text-text-primary mb-2">
          Panel Name
        </label>
        <Input
          id="panelName"
          type="text"
          placeholder="e.g. Senior Review Panel"
          value={panelName}
          onChange={(e) => setPanelName(e.target.value)}
          disabled={isUploading}
          aria-label="Panel Name"
        />
      </div>

      {/* Candidate Name Input */}
      <div>
        <label htmlFor="candidateName" className="block text-sm font-medium text-text-primary mb-2">
          Candidate Name
        </label>
        <Input
          id="candidateName"
          type="text"
          placeholder="e.g. John Doe"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
          disabled={isUploading}
          aria-label="Candidate Name"
        />
      </div>

      {/* File Upload Zone */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-3">Upload Files</label>
        <FileUploadZone onFilesSelected={handleFilesSelected} disabled={isUploading} />
      </div>

      {/* File Preview */}
      {files.size > 0 && <FilePreview files={files} onRemove={removeFileByType} />}

      {/* Already Evaluated Message */}
      {alreadyEvaluatedMessage && (
        <div className="bg-status-warning/10 border border-status-warning/30 text-status-warning px-4 py-3 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Already Evaluated</p>
            <p className="text-xs mt-1 opacity-90">{alreadyEvaluatedMessage}</p>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={!isComplete || isUploading || checkingDuplicate}
        className="w-full flex items-center justify-center"
        aria-disabled={!isComplete || isUploading || checkingDuplicate}
      >
        <Upload className="w-5 h-5" />
        {checkingDuplicate ? 'Checking...' : isUploading ? 'Evaluating...' : 'Evaluate Panel'}
      </Button>

      {/* Helper Text */}
      <p className="text-xs text-text-muted text-center">
        Ensure all three files (JD, L1 Transcript, L2 Rejection) are selected and panel/candidate details are filled before submitting.
      </p>
    </form>
  );
}
