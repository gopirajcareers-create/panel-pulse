import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EvidenceSection } from '../EvidenceSection';

describe('EvidenceSection', () => {
  it('shows fallback when no evidence', () => {
    render(<EvidenceSection evidence={null} />);
    expect(screen.getByText(/No evidence available/i)).toBeTruthy();
  });

  it('renders sanitized evidence items', () => {
    const evidence = { general: ['Hello <script>alert(1)</script>', 'Good'] };
    render(<EvidenceSection evidence={evidence} />);
    expect(screen.getByText(/Hello/)).toBeTruthy();
    // The script tag should be escaped and not executed; we only check rendered text
    expect(screen.queryByText(/script/)).toBeNull();
    expect(screen.getByText(/Good/)).toBeTruthy();
  });
});
