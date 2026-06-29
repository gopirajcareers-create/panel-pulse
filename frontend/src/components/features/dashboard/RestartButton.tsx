import { useState } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import apiClient from '@/lib/api/client';

interface RestartButtonProps {
  type: 'dashboard' | 'stage';
  evaluationId?: string;
  stageName?: string;
  onSuccess?: () => void;
  className?: string;
}

export function RestartButton({
  type,
  evaluationId,
  stageName,
  onSuccess,
  className = ''
}: RestartButtonProps) {
  const { user } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  // Only show to authorized user
  if (user?.email !== 'gopiraj.k@indium.tech') {
    return null;
  }

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      const endpoint = type === 'dashboard'
        ? '/api/v1/panel/restart/all'
        : `/api/v1/panel/restart/stage/${evaluationId}`;

      const response = await apiClient.delete(endpoint);

      if (response.data.success) {
        toast.success(
          type === 'dashboard'
            ? 'All evaluation data deleted successfully'
            : `Successfully restarted from ${stageName}`
        );
        onSuccess?.();
      } else {
        toast.error(response.data.error || 'Restart failed');
      }
    } catch (error: any) {
      console.error('Restart error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to restart';
      toast.error(errorMessage);
    } finally {
      setIsRestarting(false);
      setShowConfirm(false);
    }
  };

  const confirmMessage = type === 'dashboard'
    ? 'This will delete ALL evaluation data including Initial Screening, L1 Scoring, L2 Scoring, and Client Audit records. This action cannot be reverted.'
    : `This will delete all data from ${stageName} onwards. This action cannot be reverted.`;

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={isRestarting}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
          ${type === 'dashboard'
            ? 'bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/30'
            : 'bg-orange-600/10 hover:bg-orange-600/20 text-orange-400 border border-orange-500/30'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}`}
      >
        {isRestarting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RotateCcw className="w-4 h-4" />
        )}
        <span>Restart {type === 'dashboard' ? 'All' : stageName}</span>
      </button>

      {showConfirm && (
        <ConfirmDialog
          title="Are you sure to restart?"
          message={confirmMessage}
          confirmLabel="Yes, Restart"
          cancelLabel="Cancel"
          onConfirm={handleRestart}
          onCancel={() => setShowConfirm(false)}
          variant={type === 'dashboard' ? 'danger' : 'warning'}
        />
      )}
    </>
  );
}
