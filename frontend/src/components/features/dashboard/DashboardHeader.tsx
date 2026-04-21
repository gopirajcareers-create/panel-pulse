import { useAuth } from '@/context/AuthContext';

function getFirstName(user: { firstName?: string; email: string } | null): string {
  if (!user) return '';
  if (user.firstName) return user.firstName;
  // e.g. "gopiraj.k@indium.tech" → "gopiraj" → "Gopiraj"
  const prefix = user.email.split('@')[0].split('.')[0];
  return prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
}

export function DashboardHeader() {
  const { user } = useAuth();
  const firstName = getFirstName(user);

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary leading-tight">
        Welcome back{firstName ? `, ${firstName}!` : '!'}
      </h1>
      <p className="text-xs text-text-muted mt-0.5">
        Overview of your panel evaluations and performance metrics.
      </p>
    </div>
  );
}

export default DashboardHeader;
