import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ValidationEvidence } from '../ValidationEvidence';

describe('ValidationEvidence', () => {
  it('shows fallback when no questions provided', () => {
    render(<ValidationEvidence questions={[]} />);
    expect(screen.getByText(/No matching questions found/i)).toBeTruthy();
  });

  it('renders list of matching questions', () => {
    const questions = ['What about SQL?', 'Tell me about joins'];
    render(<ValidationEvidence questions={questions} />);
    expect(screen.getByText(/What about SQL\?/)).toBeTruthy();
    expect(screen.getByText(/Tell me about joins/)).toBeTruthy();
  });

  it('displays heading for matching questions', () => {
    render(<ValidationEvidence questions={['Test question']} />);
    expect(screen.getByText(/Matching Questions/i)).toBeTruthy();
  });
});
