import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScoreCard } from '../ScoreCard';

describe('ScoreCard', () => {
  it('renders score and category', () => {
    render(<ScoreCard score={8.2} category="Good" />);
    expect(screen.getByText('8.2')).toBeTruthy();
    expect(screen.getByText('Good')).toBeTruthy();
  });
});
