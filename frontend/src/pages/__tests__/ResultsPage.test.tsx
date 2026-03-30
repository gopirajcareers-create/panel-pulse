import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, beforeEach, expect, vi } from 'vitest';
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: any) => <div>{children}</div>,
}));


vi.mock('@/components/features/l2-validation/L2ValidatorCard', () => ({
  L2ValidatorCard: ({ l1Transcript }: any) => <div data-testid="l2-validator">L2 Validator: {l1Transcript ? 'Ready' : 'No Transcript'}</div>,
}));

import ResultsPage from '../ResultsPage';
import { useEvaluationStore } from '@/lib/stores/evaluation.store';
import { MemoryRouter } from 'react-router-dom';

describe('ResultsPage', () => {
  beforeEach(() => {
    useEvaluationStore.getState().clear();
  });

  it('shows empty state when no evaluation', () => {
    render(
      <MemoryRouter>
        <ResultsPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/No evaluation found/i)).toBeTruthy();
  });

  it('renders evaluation when present', () => {
    const sample: any = {
      jobId: 'JD-1',
      panelEfficiencyScore: 7.2,
      scoreCategory: 'Moderate',
      dimensions: {
        mandatorySkillCoverage: 1.5,
        technicalDepth: 1.2,
        scenarioRiskEvaluation: 1.0,
        frameworkKnowledge: 1.5,
        handsOnValidation: 0.8,
        leadershipEvaluation: 0.7,
        behavioralAssessment: 0.9,
        rejectionValidationAlignment: 2.0,
      },
      evidence: { general: ['Candidate: uses joins often', 'Candidate: explained optimization'] },
      timestamp: new Date().toISOString(),
    };

    useEvaluationStore.getState().setEvaluation(sample);
    useEvaluationStore.getState().setL1Transcript('Interviewer: Tell me about joins');
    useEvaluationStore.getState().setL2RejectionReason('Candidate lacks deep technical knowledge');

    render(
      <MemoryRouter>
        <ResultsPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Evaluation Results/i)).toBeTruthy();
    const scoreMatches = screen.getAllByText(/7.2/);
    expect(scoreMatches.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Candidate: uses joins often/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('l2-validator')).toBeTruthy();
  });
});
