import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (profile?.bannedAt) {
      toast({ title: 'Account banned', description: 'Your account has been deactivated. Contact an administrator.', variant: 'destructive' });
      signOut();
    }
  }, [profile?.bannedAt, signOut]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.bannedAt) {
    return <Navigate to="/login" replace />;
  }

  if (profile && !profile.approvedAt) {
    return <Navigate to="/pending-approval" replace />;
  }

  if (profile && !profile.onboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
