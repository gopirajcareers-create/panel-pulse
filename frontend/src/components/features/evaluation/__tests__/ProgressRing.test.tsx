import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProgressRing } from '../ProgressRing';

describe('ProgressRing', () => {
  it('renders percentage text and accessible label', () => {
    render(<ProgressRing size={48} stroke={6} progress={42} />);
    const text = screen.getByText(/42%/i);
    expect(text).toBeTruthy();
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('Progress'));
  });
});
