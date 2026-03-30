import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { L2ValidatorCard } from '../L2ValidatorCard';

describe('L2ValidatorCard', () => {
  const mockTranscript = 'Interviewer: Tell me about window functions. Candidate: I am familiar with them.';
  const mockRejectionReason = 'Weak window function knowledge';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input field and validate button in manual mode', () => {
    render(<L2ValidatorCard l1Transcript={mockTranscript} />);
    expect(screen.getByPlaceholderText(/Enter the L2 rejection reason/i)).toBeTruthy();
    expect(screen.getByText(/Validate Against Transcript/i)).toBeTruthy();
  });

  it('disables validate button when input is empty', () => {
    render(<L2ValidatorCard l1Transcript={mockTranscript} />);
    const button = screen.getByText(/Validate Against Transcript/i) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('enables validate button when input has text', async () => {
    render(<L2ValidatorCard l1Transcript={mockTranscript} />);
    const textarea = screen.getByPlaceholderText(/Enter the L2 rejection reason/i) as HTMLTextAreaElement;
    const button = screen.getByText(/Validate Against Transcript/i) as HTMLButtonElement;

    fireEvent.change(textarea, { target: { value: mockRejectionReason } });

    await waitFor(() => {
      expect(button.disabled).toBe(false);
    });
  });

  it('renders card with L2 validation title', () => {
    render(<L2ValidatorCard l1Transcript={mockTranscript} />);
    expect(screen.getByText(/L2 Rejection Reason Validation/i)).toBeTruthy();
  });

  it('shows stored rejection reason in auto mode', () => {
    render(
      <L2ValidatorCard
        l1Transcript={mockTranscript}
        l2RejectionReason={mockRejectionReason}
        autoValidate={true}
      />
    );
    expect(screen.getByText(mockRejectionReason)).toBeTruthy();
    // Should not show textarea input field in auto mode
    expect(screen.queryByPlaceholderText(/Enter the L2 rejection reason/i)).toBeFalsy();
  });

  it('does not show validate button in auto mode', () => {
    render(
      <L2ValidatorCard
        l1Transcript={mockTranscript}
        l2RejectionReason={mockRejectionReason}
        autoValidate={true}
      />
    );
    // In auto mode, there should be no manual validate button
    expect(screen.queryByText(/Validate Against Transcript/i)).toBeFalsy();
  });
});


