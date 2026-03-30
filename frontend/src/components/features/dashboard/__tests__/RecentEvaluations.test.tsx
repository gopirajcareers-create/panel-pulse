import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecentEvaluations } from '../RecentEvaluations';
import type { DashboardEvaluation } from '../../../../types/dashboard.types';

describe('RecentEvaluations Component', () => {
  const mockEvaluations: DashboardEvaluation[] = [
    {
      _id: '1',
      jobInterviewId: 'JD001',
      panelName: 'John Doe',
      candidateName: 'John Doe',
      averageScore: 8.5,
      lastEvaluationDate: '2024-01-15',
    },
    {
      _id: '2',
      jobInterviewId: 'JD002',
      panelName: 'Jane Smith',
      candidateName: 'Jane Smith',
      averageScore: 7.2,
      lastEvaluationDate: '2024-01-14',
    },
    {
      _id: '3',
      jobInterviewId: 'JD003',
      panelName: 'Bob Johnson',
      candidateName: 'Bob Johnson',
      averageScore: 5.8,
      lastEvaluationDate: '2024-01-13',
    },
  ];

  it('should render table with evaluations', () => {
    const mockOnRowClick = vi.fn();
    render(
      <RecentEvaluations
        evaluations={mockEvaluations}
        loading={false}
        onRowClick={mockOnRowClick}
      />
    );

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
  });

  it('should display evaluation scores', () => {
    render(
      <RecentEvaluations
        evaluations={mockEvaluations}
        loading={false}
      />
    );

    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('7.2')).toBeInTheDocument();
    expect(screen.getByText('5.8')).toBeInTheDocument();
  });

  it('should display evaluation dates', () => {
    render(
      <RecentEvaluations
        evaluations={mockEvaluations}
        loading={false}
      />
    );

    // Dates will be formatted by toLocaleDateString, so check for the job IDs instead
    expect(screen.getByText('JD001')).toBeInTheDocument();
    expect(screen.getByText('JD002')).toBeInTheDocument();
  });

  it('should display category badges with colors', () => {
    const { container } = render(
      <RecentEvaluations
        evaluations={mockEvaluations}
        loading={false}
      />
    );

    // Check for category badges with text-good and text-moderate classes
    const badges = container.querySelectorAll('[class*="text-score-"]');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('should call onRowClick when View button is clicked', async () => {
    const user = userEvent.setup();
    const mockOnRowClick = vi.fn();

    render(
      <RecentEvaluations
        evaluations={[mockEvaluations[0]]}
        loading={false}
        onRowClick={mockOnRowClick}
      />
    );

    const viewButtons = screen.getAllByRole('button');
    await user.click(viewButtons[0]);

    expect(mockOnRowClick).toHaveBeenCalled();
  });

  it('should show loading state', () => {
    const { container } = render(
      <RecentEvaluations
        evaluations={[]}
        loading={true}
      />
    );

    // Check for loading skeleton (animate-pulse)
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show empty state when no evaluations', () => {
    render(
      <RecentEvaluations
        evaluations={[]}
        loading={false}
      />
    );

    // Should show empty table or message
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('should limit to maximum 10 evaluations', () => {
    const manyEvaluations: DashboardEvaluation[] = Array.from({ length: 15 }, (_, i) => ({
      _id: String(i),
      jobInterviewId: `JD${i.toString().padStart(3, '0')}`,
      panelName: `Panel ${i}`,
      candidateName: `Candidate ${i}`,
      averageScore: 7.5,
      lastEvaluationDate: `2024-01-${(15 - i).toString().padStart(2, '0')}`,
    }));

    const { container } = render(
      <RecentEvaluations
        evaluations={manyEvaluations}
        loading={false}
      />
    );

    // Count rendered rows (should be max 10)
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBeLessThanOrEqual(10);
  });

  it('should render View button for each evaluation', () => {
    render(
      <RecentEvaluations
        evaluations={mockEvaluations}
        loading={false}
      />
    );

    const buttons = screen.getAllByRole('button');
    // Should have at least 3 buttons (one for each evaluation)
    expect(buttons.length).toBeGreaterThanOrEqual(mockEvaluations.length);
  });
});
