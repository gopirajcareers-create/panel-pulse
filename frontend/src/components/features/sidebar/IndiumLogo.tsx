export function IndiumLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Indium Logo"
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}
