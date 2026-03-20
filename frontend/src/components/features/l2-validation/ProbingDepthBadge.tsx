import React from 'react';

interface Props {
  depth: 'NO PROBING' | 'SURFACE PROBING' | 'DEEP PROBING';
}

export function ProbingDepthBadge({ depth }: Props) {
  const baseClasses = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium';

  const getColourClasses = () => {
    switch (depth) {
      case 'NO PROBING':
        return `${baseClasses} bg-red-500/20 text-red-300`;
      case 'SURFACE PROBING':
        return `${baseClasses} bg-yellow-500/20 text-yellow-300`;
      case 'DEEP PROBING':
        return `${baseClasses} bg-green-500/20 text-green-300`;
      default:
        return baseClasses;
    }
  };

  return <div className={getColourClasses()}>{depth}</div>;
}
