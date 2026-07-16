import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Search, Shield, KeyRound, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth, type AppRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { UserTable, type UserRow } from '@/components/user-management/UserTable';
import { ScopedRolesDialog } from '@/components/user-management/ScopedRolesDialog';
import { usePageMeta } from '@/hooks/usePageMeta';

interface Department { id: string; name: string; }
interface LegalEntity { id: string; name: string; }
interface OfficeSite { id: string; name: string; legal_entity_id: string; }

export default function UserManagement() {
  usePageMeta({ title: 'User management', description: 'View and manage existing users, their roles, and scopes.', helpKey: '/users' });
  const { role, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);
  const [officeSites, setOfficeSites] = useState<OfficeSite[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [banConfirm, setBanConfirm] = useState<UserRow | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState<UserRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [scopedUser, setScopedUser] = useState<UserRow | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<{ email: string; fullName: string }>({ email: '', fullName: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    email: string; password: string; fullName: string;
    role: AppRole; legalEntityId: string; officeSiteId: string; departmentId: string;
  }>({ email: '', password: '', fullName: '', role: 'user', legalEntityId: '', officeSiteId: '', departmentId: '' });

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password) {
      toast({ title: 'Error', description: 'Email and password are required', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: {
          action: 'create-user',
          email: createForm.email,
          password: createForm.password,
          fullName: createForm.fullName,
          role: createForm.role,
          legalEntityId: createForm.legalEntityId || null,
          officeSiteId: createForm.officeSiteId || null,
          departmentId: createForm.departmentId || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'User created', description: `${createForm.email} can sign in immediately` });
      setCreateOpen(false);
      setCreateForm({ email: '', password: '', fullName: '', role: 'user', legalEntityId: '', officeSiteId: '', departmentId: '' });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to create user', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteForm.email) {
      toast({ title: 'Error', description: 'Email is required', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const redirectTo = `${window.location.origin}/onboarding`;
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'invite-user', email: inviteForm.email, fullName: inviteForm.fullName, redirectTo },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Invite sent', description: `Invitation emailed to ${inviteForm.email}` });
      setInviteOpen(false);
      setInviteForm({ email: '', fullName: '' });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to send invite', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };
  const [editForm, setEditForm] = useState<{ fullName: string; email: string; onboarded: boolean }>({ fullName: '', email: '', onboarded: false });

  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setEditForm({ fullName: u.fullName ?? '', email: u.email ?? '', onboarded: !!u.onboarded });
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setActionLoading(true);
    try {
      const payload: any = { action: 'update-user', userId: editUser.userId };
      if (editForm.fullName !== (editUser.fullName ?? '')) payload.fullName = editForm.fullName;
      if (editForm.email && editForm.email !== editUser.email) payload.email = editForm.email;
      if (editForm.onboarded !== editUser.onboarded) payload.onboarded = editForm.onboarded;
      const { data, error } = await supabase.functions.invoke('admin-user-management', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'User updated', description: `${editForm.fullName || 'User'} saved` });
      setEditUser(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to update user', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, full_name, department_id, legal_entity_id, office_site_id, onboarded, created_at, banned_at, approved_at');
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase.from('user_roles').select('user_id, role, scope_type');
      if (rErr) throw rErr;

      const { data: depts } = await supabase.from('departments').select('id, name');
      const { data: entities } = await supabase.from('legal_entities').select('id, name');
      const { data: sites } = await supabase.from('office_sites').select('id, name, legal_entity_id');

      // Fetch emails (admin-only edge function reads auth.users)
      const { data: emailData, error: emailErr } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'list-users' },
      });
      if (emailErr) console.error('Failed to load emails:', emailErr);
      const emailMap: Record<string, string> = (emailData as any)?.emails ?? {};

      setDepartments(depts ?? []);
      setLegalEntities(entities ?? []);
      setOfficeSites(sites ?? []);

      // Display the user's global (primary) role; scoped roles are managed via the Scopes dialog.
      const roleMap = new Map<string, AppRole>();
      const rank: Record<AppRole, number> = { user: 0, manager: 1, admin: 2 };
      for (const r of roles ?? []) {
        if ((r as any).scope_type !== 'global') continue;
        const cur = roleMap.get(r.user_id);
        const next = r.role as AppRole;
        if (!cur || rank[next] > rank[cur]) roleMap.set(r.user_id, next);
      }
      const deptMap = new Map(depts?.map(d => [d.id, d.name]));
      const entityMap = new Map(entities?.map(e => [e.id, e.name]));
      const siteMap = new Map(sites?.map(s => [s.id, s.name]));

      const userRows: UserRow[] = (profiles ?? []).map(p => ({
        userId: p.user_id,
        email: emailMap[p.user_id] ?? '',
        fullName: p.full_name,
        departmentId: p.department_id,
        departmentName: p.department_id ? deptMap.get(p.department_id) ?? null : null,
        legalEntityId: p.legal_entity_id,
        legalEntityName: p.legal_entity_id ? entityMap.get(p.legal_entity_id) ?? null : null,
        officeSiteId: p.office_site_id,
        officeSiteName: p.office_site_id ? siteMap.get(p.office_site_id) ?? null : null,
        role: roleMap.get(p.user_id) ?? 'user',
        onboarded: p.onboarded,
        createdAt: p.created_at,
        bannedAt: (p as any).banned_at ?? null,
        approvedAt: (p as any).approved_at ?? null,
      }));

      setUsers(userRows);
    } catch (e) {
      console.error('Failed to fetch users:', e);
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role !== 'admin') return;
    fetchUsers();
  }, [role]);

  if (role !== 'admin') return <Navigate to="/" replace />;

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    if (userId === currentUser?.id && newRole !== 'admin') {
      toast({ title: 'Warning', description: "You can't remove your own admin role", variant: 'destructive' });
      return;
    }
    try {
      // Only mutate the user's primary (global) role — leave any scoped roles intact.
      const { data: existing, error: selErr } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('scope_type', 'global')
        .maybeSingle();
      if (selErr) throw selErr;
      if (existing) {
        const { error } = await supabase.from('user_roles').update({ role: newRole }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole, scope_type: 'global', scope_id: null });
        if (error) throw error;
      }
      setUsers(prev => prev.map(u => u.userId === userId ? { ...u, role: newRole } : u));
      toast({ title: 'Updated', description: `Role changed to ${newRole}` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to update role', variant: 'destructive' });
    }
  };

  const handleDepartmentChange = async (userId: string, deptId: string) => {
    try {
      const { error } = await supabase.from('profiles').update({ department_id: deptId }).eq('user_id', userId);
      if (error) throw error;
      const deptName = departments.find(d => d.id === deptId)?.name ?? null;
      setUsers(prev => prev.map(u => u.userId === userId ? { ...u, departmentId: deptId, departmentName: deptName } : u));
      toast({ title: 'Updated', description: 'Department changed' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to update department', variant: 'destructive' });
    }
  };

  const handleLegalEntityChange = async (userId: string, entityId: string) => {
    try {
      const { error } = await supabase.from('profiles').update({ legal_entity_id: entityId, office_site_id: null }).eq('user_id', userId);
      if (error) throw error;
      const entityName = legalEntities.find(e => e.id === entityId)?.name ?? null;
      setUsers(prev => prev.map(u => u.userId === userId ? { ...u, legalEntityId: entityId, legalEntityName: entityName, officeSiteId: null, officeSiteName: null } : u));
      toast({ title: 'Updated', description: 'Legal entity changed' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to update legal entity', variant: 'destructive' });
    }
  };

  const handleSiteChange = async (userId: string, siteId: string) => {
    try {
      const { error } = await supabase.from('profiles').update({ office_site_id: siteId }).eq('user_id', userId);
      if (error) throw error;
      const siteName = officeSites.find(s => s.id === siteId)?.name ?? null;
      setUsers(prev => prev.map(u => u.userId === userId ? { ...u, officeSiteId: siteId, officeSiteName: siteName } : u));
      toast({ title: 'Updated', description: 'Office site changed' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to update site', variant: 'destructive' });
    }
  };

  const handleApprove = async (user: UserRow) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'approve', userId: user.userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'User approved', description: `${user.fullName ?? 'User'} has been approved` });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to approve user', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectConfirm) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'reject', userId: rejectConfirm.userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'User rejected', description: `${rejectConfirm.fullName ?? 'User'} has been removed` });
      setRejectConfirm(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to reject user', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'delete-user', userId: deleteConfirm.userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'User deleted', description: `${deleteConfirm.fullName ?? 'User'} has been permanently deleted` });
      setDeleteConfirm(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to delete user', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBanToggle = async () => {
    if (!banConfirm) return;
    setActionLoading(true);
    const action = banConfirm.bannedAt ? 'unban' : 'ban';
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: { action, userId: banConfirm.userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: action === 'ban' ? 'User banned' : 'User unbanned', description: `${banConfirm.fullName ?? 'User'} has been ${action === 'ban' ? 'banned' : 'unbanned'}` });
      setBanConfirm(null);
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || `Failed to ${action} user`, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordUser || !newPassword) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'change-password', userId: passwordUser.userId, newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Password changed', description: `Password updated for ${passwordUser.fullName ?? 'user'}` });
      setPasswordUser(null);
      setNewPassword('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to change password', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = users.filter(u =>
    (u.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.departmentName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const pendingUsers = filtered.filter(u => !u.approvedAt && !u.bannedAt);
  const activeUsers = filtered.filter(u => !!u.approvedAt || !!u.bannedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">User Access Management</h1>
          <p className="text-muted-foreground">Manage user roles, departments, and account status</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />Invite user
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />Create user
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, department, or role..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending Approval {pendingUsers.length > 0 && `(${pendingUsers.length})`}
          </TabsTrigger>
          <TabsTrigger value="all">
            All Users ({activeUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Pending Approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-8 text-center text-muted-foreground">Loading...</p>
              ) : pendingUsers.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No pending approvals.</p>
              ) : (
                <UserTable
                  users={pendingUsers}
                  departments={departments}
                  legalEntities={legalEntities}
                  officeSites={officeSites}
                  currentUserId={currentUser?.id}
                  onRoleChange={handleRoleChange}
                  onDepartmentChange={handleDepartmentChange}
                  onLegalEntityChange={handleLegalEntityChange}
                  onSiteChange={handleSiteChange}
                  onBanToggle={setBanConfirm}
                  onApprove={handleApprove}
                  onReject={setRejectConfirm}
                  onChangePassword={setPasswordUser}
                  onScopedRoles={setScopedUser}
                  onEdit={openEdit}
                  onDelete={setDeleteConfirm}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Users ({activeUsers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-8 text-center text-muted-foreground">Loading...</p>
              ) : activeUsers.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No users found.</p>
              ) : (
                <UserTable
                  users={activeUsers}
                  departments={departments}
                  legalEntities={legalEntities}
                  officeSites={officeSites}
                  currentUserId={currentUser?.id}
                  onRoleChange={handleRoleChange}
                  onDepartmentChange={handleDepartmentChange}
                  onLegalEntityChange={handleLegalEntityChange}
                  onSiteChange={handleSiteChange}
                  onBanToggle={setBanConfirm}
                  onChangePassword={setPasswordUser}
                  onScopedRoles={setScopedUser}
                  onEdit={openEdit}
                  onDelete={setDeleteConfirm}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ScopedRolesDialog
        user={scopedUser}
        departments={departments}
        legalEntities={legalEntities}
        officeSites={officeSites}
        onClose={() => setScopedUser(null)}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              Permanently delete {deleteConfirm?.fullName ?? 'this user'} ({deleteConfirm?.email}).
              Their account, profile, and roles will be removed. Documents and activity logs they generated are kept for auditing.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={actionLoading}>
              {actionLoading ? 'Deleting…' : 'Delete user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject confirmation dialog */}
      <Dialog open={!!rejectConfirm} onOpenChange={() => setRejectConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject User</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject {rejectConfirm?.fullName ?? 'this user'}? Their account will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Reject & Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban/Unban confirmation dialog */}
      <Dialog open={!!banConfirm} onOpenChange={() => setBanConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{banConfirm?.bannedAt ? 'Unban User' : 'Ban User'}</DialogTitle>
            <DialogDescription>
              {banConfirm?.bannedAt
                ? `Are you sure you want to unban ${banConfirm?.fullName ?? 'this user'}? They will be able to log in again.`
                : `Are you sure you want to ban ${banConfirm?.fullName ?? 'this user'}? They will be immediately locked out.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanConfirm(null)}>Cancel</Button>
            <Button
              variant={banConfirm?.bannedAt ? 'default' : 'destructive'}
              onClick={handleBanToggle}
              disabled={actionLoading}
            >
              {actionLoading ? 'Processing...' : banConfirm?.bannedAt ? 'Unban' : 'Ban User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password dialog */}
      <Dialog open={!!passwordUser} onOpenChange={() => { setPasswordUser(null); setNewPassword(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Set a new password for {passwordUser?.fullName ?? 'this user'}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="New password (min 6 characters)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPasswordUser(null); setNewPassword(''); }}>Cancel</Button>
            <Button onClick={handleChangePassword} disabled={actionLoading || newPassword.length < 6}>
              {actionLoading ? 'Updating...' : 'Update Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update profile details. Changing email re-confirms the account automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Onboarded</p>
                <p className="text-xs text-muted-foreground">Skip the onboarding wizard for this user.</p>
              </div>
              <Switch checked={editForm.onboarded} onCheckedChange={v => setEditForm(f => ({ ...f, onboarded: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading}>{actionLoading ? 'Saving...' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>Send an email invitation. The user sets their own password from the link, then completes onboarding. To create a user with a role + scope without onboarding, use <strong>Create user</strong> instead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="user@gulfcryo.com" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Full name (optional)</Label>
              <Input value={inviteForm.fullName} onChange={e => setInviteForm(f => ({ ...f, fullName: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={actionLoading || !inviteForm.email}>{actionLoading ? 'Sending...' : 'Send invite'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>Create a user with a password, assign role + scope, and skip onboarding. They can sign in immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={createForm.fullName} onChange={e => setCreateForm(f => ({ ...f, fullName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Password (min 6 chars)</Label>
              <Input type="text" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm(f => ({ ...f, role: v as AppRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Legal entity</Label>
              <Select value={createForm.legalEntityId} onValueChange={(v) => setCreateForm(f => ({ ...f, legalEntityId: v, officeSiteId: '' }))}>
                <SelectTrigger><SelectValue placeholder="Select legal entity" /></SelectTrigger>
                <SelectContent>
                  {legalEntities.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Office site</Label>
              <Select value={createForm.officeSiteId} onValueChange={(v) => setCreateForm(f => ({ ...f, officeSiteId: v }))} disabled={!createForm.legalEntityId}>
                <SelectTrigger><SelectValue placeholder={createForm.legalEntityId ? 'Select site' : 'Select entity first'} /></SelectTrigger>
                <SelectContent>
                  {officeSites.filter(s => s.legal_entity_id === createForm.legalEntityId).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={createForm.departmentId} onValueChange={(v) => setCreateForm(f => ({ ...f, departmentId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={actionLoading || !createForm.email || createForm.password.length < 6}>
              {actionLoading ? 'Creating...' : 'Create user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
