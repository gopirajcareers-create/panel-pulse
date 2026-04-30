/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        // New Design System - Reference Financial Dashboard
        // Primary brand colors (warm orange accent)
        'accent-primary': '#FF6B4A',
        'accent-secondary': '#E84C3D',
        'accent-success': '#10B981',
        'accent-error': '#EF4444',
        
        // Text colors (optimized for dark mode)
        'text-primary': '#F3F4F6',        // Light text for dark backgrounds
        'text-secondary': '#D1D5DB',      // Medium gray text
        'text-muted': '#9CA3AF',          // Muted gray text
        
        // Background colors (dark mode)
        'bg-base': '#1F2937',             // Dark gray base (like surface-secondary)
        'bg-surface': '#111827',          // Darker surface (like surface-primary)
        'border-primary': '#374151',      // Dark border
        
        // Scoring dimension colours (kept for compatibility)
        'score-mandatory': '#818cf8',
        'score-technical': '#f472b6',
        'score-scenario': '#34d399',
        'score-framework': '#fbbf24',
        'score-handson': '#f87171',
        'score-leadership': '#60a5fa',
        'score-behavioral': '#a78bfa',
        'score-structure': '#94e2d5',
        
        // Score category colours (kept for compatibility)
        'score-poor': '#ef4444',
        'score-moderate': '#f59e0b',
        'score-good': '#10b981',
      },
      spacing: {
        'card': '24px',
        'card-gap': '20px',
        'section': '32px',
      },
      padding: {
        'card': '24px',
      },
      gap: {
        'card': '20px',
      },
      borderRadius: {
        'card': '12px',
        'card-lg': '16px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 4px 6px rgba(0, 0, 0, 0.1)',
        'card-elevated': '0 10px 15px rgba(0, 0, 0, 0.1)',
      },
      transitionDuration: {
        'smooth': '300ms',
        'snappy': '200ms',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // New typography scale
        'title': ['32px', { lineHeight: '1.4', fontWeight: '700' }],
        'heading': ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        'subheading': ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        'metric-label': ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'metric-value': ['28px', { lineHeight: '1.4', fontWeight: '700' }],
      },
      keyframes: {
        pulse: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
        bounce: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        shimmer: { '0%': { backgroundPosition: '-200%' }, '100%': { backgroundPosition: '200%' } },
        spin: { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
        'card-lift': { '0%': { transform: 'translateY(0px)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }, '100%': { transform: 'translateY(-2px)', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' } },
      },
      animation: {
        'status-pulse': 'pulse 2s ease-in-out infinite',
        'dot-bounce': 'bounce 0.6s ease-in-out infinite',
        shimmer: 'shimmer 1.5s infinite linear',
        'spin-slow': 'spin 1.5s linear infinite',
        'card-lift': 'card-lift 300ms ease-out',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
