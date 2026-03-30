import React, { useEffect, useId, useState } from 'react';

interface Props {
  size?: number;
  stroke?: number;
  progress: number; // 0-100
}

export function ProgressRing({ size = 64, stroke = 8, progress }: Props) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const id = useId();
  const gradId = `grad-${id}`;
  // Initialize display with progress so tests are deterministic
  const [display, setDisplay] = useState(Math.max(0, Math.min(100, progress)));

  useEffect(() => {
    // animate display value smoothly
    const start = display;
    const end = Math.max(0, Math.min(100, progress));
    const duration = 600;
    const startTime = performance.now();

    let raf = 0;
    const step = (t: number) => {
      const elapsed = t - startTime;
      const pct = Math.min(1, elapsed / duration);
      const value = start + (end - start) * pct;
      setDisplay(Number(value.toFixed(1)));
      if (pct < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const offset = circumference - (display / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Progress ${Math.round(display)} percent`}>
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <circle r={radius} fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          r={radius}
          fill="transparent"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform="rotate(-90)"
          style={{ transition: 'stroke-dashoffset 300ms linear' }}
        />
      </g>
      <defs>
        <linearGradient id={gradId} x1="0%" x2="100%">
          <stop offset="0%" stopColor="#FF6B00" />
          <stop offset="100%" stopColor="#FF9F1C" />
        </linearGradient>
      </defs>
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize={12} fill="#fff">
        {Math.round(display)}%
      </text>
    </svg>
  );
}
