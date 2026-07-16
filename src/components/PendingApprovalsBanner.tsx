import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';

export default function PendingApprovalsBanner() {
  const { count, canApprove } = usePendingApprovals();
  const location = useLocation();
  if (!canApprove || count === 0) return null;
  if (location.pathname === '/approvals') return null;
  return (
    <Link
      to="/approvals"
      className="flex items-center gap-2 border-b bg-warning/10 px-4 py-2 text-sm text-warning hover:bg-warning/20 lg:px-6"
    >
      <AlertTriangle className="h-4 w-4" />
      <span>
        <strong>{count}</strong> {count === 1 ? 'user is' : 'users are'} awaiting approval.
      </span>
      <span className="ml-auto font-medium underline">Review</span>
    </Link>
  );
}