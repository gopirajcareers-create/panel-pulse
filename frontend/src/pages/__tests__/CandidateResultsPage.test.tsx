import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import CandidateResultsPage from '../CandidateResultsPage';
import { pipelineApi } from '@/lib/api/pipeline.api';

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/lib/api/pipeline.api', () => ({
  pipelineApi: {
    getCandidate: vi.fn(),
  },
  formatPipelineEvaluation: (evaluation: any) => {
    if (!evaluation) return null;
    return {
      score: evaluation.score ?? 0,
      scoreCategory: evaluation.score >= 8 ? 'Good' : evaluation.score >= 5 ? 'Moderate' : 'Poor',
      categories: evaluation.categories || {},
      evidence: evaluation.evidence || {},
      moderation: evaluation.moderation || null,
      panel_summary: evaluation.panel_summary || '',
      gap_analysis: evaluation.gap_analysis || '',
    };
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('jobId=JD123&candidateName=John Doe')],
  };
});

describe('CandidateResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    // Mock getCandidate to return a promise that doesn't resolve immediately
    (pipelineApi.getCandidate as any).mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <CandidateResultsPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading candidate pipeline details/i)).toBeTruthy();
  });

  it('renders candidate stage 1 details on successful fetch', async () => {
    const mockDetail = {
      _id: '1',
      jobId: 'JD123',
      candidateName: 'John Doe',
      panelName: 'L1 Panel',
      panelEmail: 'panel@hr.tech',
      panelId: 'PN01',
      completedStages: ['stage1'],
      stage1: {
        completed: true,
        completedAt: new Date().toISOString(),
        jdText: 'React developer position',
        resumeText: 'John Doe is a React dev',
        analysis: {
          mandatorySkills: ['React', 'TypeScript'],
          goodToHaveSkills: ['Next.js'],
          keySkills: ['React', 'TypeScript'],
          mandatorySkillsMatch: [
            { skill: 'React', matched: true, evidence: 'Used React for 4 years' },
            { skill: 'TypeScript', matched: false, evidence: 'Not found' },
          ],
          additionalSkillsMatch: [
            { skill: 'Next.js', matched: true, evidence: 'Next.js projects in resume' },
          ],
          screeningSummary: 'Good candidate.',
          matchScore: 80,
          experienceMatch: 'Matches 4 years.',
          status: 'Eligible',
        },
      },
    };

    (pipelineApi.getCandidate as any).mockResolvedValue(mockDetail);

    render(
      <MemoryRouter>
        <CandidateResultsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeTruthy();
    });

    expect(screen.getByText('ID: JD123')).toBeTruthy();
    expect(screen.getByText('Panel: L1 Panel')).toBeTruthy();
    expect(screen.getByText('Match Score: 80%')).toBeTruthy();
    expect(screen.getByText(/Good candidate/i)).toBeTruthy();
  });
});
