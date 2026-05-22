import { render, screen } from '@testing-library/react';
import { DocumentAnalysisLoader } from '../DocumentAnalysisLoader';
import { describe, it, expect } from 'vitest';

describe('DocumentAnalysisLoader', () => {
  it('renders with default props', () => {
    render(<DocumentAnalysisLoader />);
    expect(screen.getByText(/processing panel evaluation/i)).toBeInTheDocument();
  });

  it('displays custom message when provided', () => {
    render(<DocumentAnalysisLoader message="Custom loading message" />);
    expect(screen.getByText(/custom loading message/i)).toBeInTheDocument();
  });

  it('shows progress bar when progress is provided', () => {
    render(<DocumentAnalysisLoader progress={45} />);
    expect(screen.getByText(/45% complete/i)).toBeInTheDocument();
  });

  it('displays stage-specific message', () => {
    render(<DocumentAnalysisLoader stage="analyzing" />);
    expect(screen.getByText(/analyzing interview transcript/i)).toBeInTheDocument();
  });

  it('shows time estimate when progress is provided', () => {
    render(<DocumentAnalysisLoader progress={50} showTimeEstimate={true} />);
    expect(screen.getByText(/remaining/i)).toBeInTheDocument();
  });

  it('displays rotating tips', () => {
    render(<DocumentAnalysisLoader />);
    const tipElement = screen.getByText(/our ai analyzes/i, { exact: false });
    expect(tipElement).toBeInTheDocument();
  });
});
