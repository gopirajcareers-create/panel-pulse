import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DimensionCard } from '../DimensionCard';

describe('DimensionCard', () => {
  it('renders name, score and evidence', () => {
    render(<DimensionCard name="Technical Depth" score={1.2} evidence={["Candidate: explained indexing"]} />);
    expect(screen.getByText('Technical Depth')).toBeTruthy();
    expect(screen.getByText('1.2 / 10')).toBeTruthy();
    expect(screen.getByText('Candidate: explained indexing')).toBeTruthy();
  });
});
