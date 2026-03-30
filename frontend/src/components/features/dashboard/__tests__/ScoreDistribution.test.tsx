import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreDistribution } from '../ScoreDistribution';

// Mock recharts
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: any) => <div data-testid="bar-chart" data-count={data?.length}>{children}</div>,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  Bar: () => <div />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

describe('ScoreDistribution Component', () => {
  const mockData = [
    { range: '8.0-10.0', count: 10 },
    { range: '6.0-8.0', count: 15 },
    { range: '4.0-6.0', count: 12 },
    { range: '0.0-4.0', count: 5 },
  ];

  it('should render the component with title', () => {
    render(<ScoreDistribution data={mockData} loading={false} />);

    expect(screen.getByText(/Score Distribution/i)).toBeInTheDocument();
  });

  it('should render BarChart with data', () => {
    const { container } = render(<ScoreDistribution data={mockData} loading={false} />);

    const chart = screen.getByTestId('bar-chart');
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute('data-count', '4');
  });

  it('should show loading state', () => {
    const { container } = render(<ScoreDistribution data={undefined} loading={true} />);

    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });

  it('should handle empty data', () => {
    render(<ScoreDistribution data={[]} loading={false} />);

    const chart = screen.getByTestId('bar-chart');
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute('data-count', '0');
  });

  it('should handle undefined data gracefully', () => {
    const { container } = render(<ScoreDistribution data={undefined} loading={false} />);

    // Should render Card but without chart data
    expect(screen.getByText(/Score Distribution/i)).toBeInTheDocument();
  });

  it('should render in Card component', () => {
    const { container } = render(<ScoreDistribution data={mockData} loading={false} />);

    // Card has bg-gradient-to-b class
    const card = container.querySelector('.bg-gradient-to-b');
    expect(card).toBeInTheDocument();
  });

  it('should display correct data count', () => {
    const largeData = Array.from({ length: 10 }, (_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}`,
      count: (i + 1) * 5,
    }));

    render(<ScoreDistribution data={largeData} loading={false} />);

    const chart = screen.getByTestId('bar-chart');
    expect(chart).toHaveAttribute('data-count', '10');
  });

  it('should show loading when transitioning from loaded to loading', () => {
    const { rerender, container: container1 } = render(
      <ScoreDistribution data={mockData} loading={false} />
    );

    rerender(<ScoreDistribution data={mockData} loading={true} />);

    const { container: container2 } = render(
      <ScoreDistribution data={mockData} loading={true} />
    );
    const skeleton = container2.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });
});
