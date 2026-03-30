import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProbingDepthBadge } from '../ProbingDepthBadge';

describe('ProbingDepthBadge', () => {
  it('renders NO PROBING with grey styling', () => {
    render(<ProbingDepthBadge depth="NO PROBING" />);
    const badge = screen.getByText('NO PROBING');
    expect(badge).toBeTruthy();
    expect(badge).toHaveClass('bg-gray-500/20');
  });

  it('renders SURFACE PROBING with yellow styling', () => {
    render(<ProbingDepthBadge depth="SURFACE PROBING" />);
    const badge = screen.getByText('SURFACE PROBING');
    expect(badge).toBeTruthy();
    expect(badge).toHaveClass('bg-yellow-500/20');
  });

  it('renders DEEP PROBING with green styling', () => {
    render(<ProbingDepthBadge depth="DEEP PROBING" />);
    const badge = screen.getByText('DEEP PROBING');
    expect(badge).toBeTruthy();
    expect(badge).toHaveClass('bg-green-500/20');
  });
});
