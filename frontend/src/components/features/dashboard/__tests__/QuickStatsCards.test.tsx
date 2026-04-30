import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuickStatsCards } from '../QuickStatsCards';

describe('QuickStatsCards Component', () => {
  it('should render stat cards with provided values', () => {
    render(
      <QuickStatsCards
        totalEvaluations={42}
        averageScore={8.5}
        lastEvaluationDate="2024-01-15"
        evaluationsThisWeek={5}
        loading={false}
      />
    );

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('2024-01-15')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('should display stat labels', () => {
    render(
      <QuickStatsCards
        totalEvaluations={10}
        averageScore={7.5}
        lastEvaluationDate="2024-01-10"
        evaluationsThisWeek={2}
        loading={false}
      />
    );

    expect(screen.getByText(/Total Evaluations/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Average Score/i)).toBeInTheDocument();
    expect(screen.getByText(/Last Evaluation/i)).toBeInTheDocument();
    expect(screen.getByText(/This Week/i)).toBeInTheDocument();
  });

  it('should render loading state when loading is true', () => {
    const { container } = render(
      <QuickStatsCards
        totalEvaluations={undefined}
        averageScore={undefined}
        lastEvaluationDate={undefined}
        evaluationsThisWeek={undefined}
        loading={true}
      />
    );

    // Check for skeleton loaders (animate-pulse class)
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should handle undefined values gracefully', () => {
    render(
      <QuickStatsCards
        totalEvaluations={undefined}
        averageScore={undefined}
        lastEvaluationDate={undefined}
        evaluationsThisWeek={undefined}
        loading={false}
      />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should render all four stat cards', () => {
    const { container } = render(
      <QuickStatsCards
        totalEvaluations={10}
        averageScore={8}
        lastEvaluationDate="2024-01-10"
        evaluationsThisWeek={2}
        loading={false}
      />
    );

    // Cards have bg-gradient-to-b class
    const cards = container.querySelectorAll('.bg-gradient-to-b');
    expect(cards.length).toBeGreaterThanOrEqual(4);
  });

  it('should apply correct icon classes', () => {
    const { container } = render(
      <QuickStatsCards
        totalEvaluations={10}
        averageScore={8}
        lastEvaluationDate="2024-01-10"
        evaluationsThisWeek={2}
        loading={false}
      />
    );

    // Check for icon SVGs (lucide icons)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });
});
