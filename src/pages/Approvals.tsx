import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Check } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { usePageMeta } from '@/hooks/usePageMeta';

interface PendingRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  department_name: string | null;
  legal_entity_name: string | null;
  office_site_name: string | null;
  created_at: string;
}

export default function Approvals() {
  usePageMeta({ title: 'User approvals', description: 'Review and approve users waiting for access.', helpKey: '/approvals' });
  const { role, hasPermission } = useAuth();
  const canSee = role === 'admin' || hasPermission('approve_users');
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchPending = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_pending_approvals');
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setRows((data as PendingRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (canSee) fetchPending();
  }, [canSee]);

  if (!canSee) return <Navigate to="/" replace />;

  const approve = async (r: PendingRow) => {
    setBusy(r.user_id);
    const { error } = await supabase.rpc('approve_user', { _user_id: r.user_id });
    setBusy(null);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Approved', description: `${r.full_name ?? r.email ?? 'User'} can now sign in` });
    setRows(prev => prev.filter(x => x.user_id !== r.user_id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User Approvals</h1>
        <p className="text-muted-foreground">
          Approve sign-ups so they can access the app.
          {role !== 'admin' && ' You can approve users in your department.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Pending {rows.length > 0 && `(${rows.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No users awaiting approval.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Legal Entity / Site</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.user_id}>
                    <TableCell>{r.full_name ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email ?? '—'}</TableCell>
                    <TableCell>{r.department_name ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[r.legal_entity_name, r.office_site_name].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => approve(r)}
                        disabled={busy === r.user_id}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        {busy === r.user_id ? 'Approving...' : 'Approve'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}