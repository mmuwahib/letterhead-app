import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Info, ShieldCheck, Layers, Sparkles, Check, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { AppRole, ScopeType } from '@/contexts/AuthContext';
import type { UserRow } from './UserTable';
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from '@/lib/permissions';

interface Department { id: string; name: string; }
interface LegalEntity { id: string; name: string; }
interface OfficeSite { id: string; name: string; legal_entity_id: string; }

interface RoleRow {
  id: string;
  role: AppRole;
  scope_type: ScopeType;
  scope_id: string | null;
}

interface NamedRole {
  id: string;
  name: string;
  description: string;
  base_role: AppRole;
  scope_type: ScopeType;
  scope_id: string | null;
  permissions: Record<string, boolean>;
}

interface AssignmentRow {
  id: string;
  role_definition_id: string;
}

interface Props {
  user: UserRow | null;
  departments: Department[];
  legalEntities: LegalEntity[];
  officeSites: OfficeSite[];
  onClose: () => void;
}

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: 'Full access to everything in the system.',
  manager: 'Can manage their department\u2019s documents, templates and logs.',
  user: 'Can upload documents and view their own archive.',
};

const SCOPE_DESCRIPTIONS: Record<ScopeType, string> = {
  global: 'Applies everywhere, across all entities and sites.',
  legal_entity: 'Limits the role to a single legal entity.',
  site: 'Limits the role to a single office site.',
  department: 'Limits the role to a single department.',
};

export function ScopedRolesDialog({ user, departments, legalEntities, officeSites, onClose }: Props) {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftRole, setDraftRole] = useState<AppRole>('manager');
  const [draftScope, setDraftScope] = useState<ScopeType>('global');
  const [draftScopeId, setDraftScopeId] = useState<string>('');
  const [namedRoles, setNamedRoles] = useState<NamedRole[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [pickRoleId, setPickRoleId] = useState<string>('');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('user_roles')
      .select('id, role, scope_type, scope_id')
      .eq('user_id', user.userId);
    if (error) {
      toast({ title: 'Failed to load roles', description: error.message, variant: 'destructive' });
    } else {
      setRows((data ?? []) as any);
    }
    const [defs, asg] = await Promise.all([
      supabase.from('role_definitions').select('*').order('name'),
      supabase.from('user_role_assignments').select('id, role_definition_id').eq('user_id', user.userId),
    ]);
    setNamedRoles(((defs.data ?? []) as any[]).map(r => ({ ...r, permissions: (r.permissions ?? {}) as Record<string, boolean> })));
    setAssignments((asg.data ?? []) as AssignmentRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.userId]);

  const scopeLabelPlain = (scopeType: ScopeType, scopeId: string | null) => {
    if (scopeType === 'global') return 'Everywhere';
    const map: Record<string, string | undefined> = {
      legal_entity: legalEntities.find(e => e.id === scopeId)?.name,
      site: officeSites.find(s => s.id === scopeId)?.name,
      department: departments.find(d => d.id === scopeId)?.name,
    };
    const target = map[scopeType] ?? '\u2014';
    const noun = scopeType === 'legal_entity' ? 'legal entity' : scopeType;
    return `only in ${noun} \u201C${target}\u201D`;
  };

  const handleAdd = async () => {
    if (!user) return;
    if (draftScope !== 'global' && !draftScopeId) {
      toast({ title: 'Pick a scope target', variant: 'destructive' });
      return;
    }
    const payload: any = {
      user_id: user.userId,
      role: draftRole,
      scope_type: draftScope,
      scope_id: draftScope === 'global' ? null : draftScopeId,
    };
    const { error } = await supabase.from('user_roles').insert(payload);
    if (error) {
      toast({ title: 'Failed to add role', description: error.message, variant: 'destructive' });
      return;
    }
    setDraftScopeId('');
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('user_roles').delete().eq('id', id);
    if (error) {
      toast({ title: 'Failed to remove role', description: error.message, variant: 'destructive' });
      return;
    }
    load();
  };

  const handleAssignNamed = async () => {
    if (!user || !pickRoleId) return;
    const { error } = await supabase
      .from('user_role_assignments')
      .insert({ user_id: user.userId, role_definition_id: pickRoleId });
    if (error) {
      toast({ title: 'Assign failed', description: error.message, variant: 'destructive' });
      return;
    }
    setPickRoleId('');
    load();
  };

  const handleUnassignNamed = async (id: string) => {
    const { error } = await supabase.from('user_role_assignments').delete().eq('id', id);
    if (error) {
      toast({ title: 'Remove failed', description: error.message, variant: 'destructive' });
      return;
    }
    load();
  };

  const scopeOptions = (() => {
    if (draftScope === 'legal_entity') return legalEntities.map(e => ({ id: e.id, name: e.name }));
    if (draftScope === 'site') return officeSites.map(s => ({ id: s.id, name: s.name }));
    if (draftScope === 'department') return departments.map(d => ({ id: d.id, name: d.name }));
    return [];
  })();

  // Effective permissions: mirror useAuth().hasPermission logic.
  const effective = useMemo(() => {
    const granted = new Set<PermissionKey>();
    const rank: Record<AppRole, number> = { user: 0, manager: 1, admin: 2 };
    const topRole = rows.reduce<AppRole>((acc, r) => (rank[r.role] > rank[acc] ? r.role : acc), 'user');
    const isApproved = !!user?.approvedAt && !user?.bannedAt;
    if (topRole === 'admin') {
      PERMISSION_KEYS.forEach(k => granted.add(k));
    } else {
      if (isApproved) { granted.add('upload'); granted.add('view_archive'); }
      if (topRole === 'manager') { granted.add('manage_templates'); granted.add('view_logs'); }
      const assignedDefs = assignments.map(a => namedRoles.find(d => d.id === a.role_definition_id)).filter(Boolean) as NamedRole[];
      for (const def of assignedDefs) {
        for (const k of PERMISSION_KEYS) {
          if (def.permissions?.[k]) granted.add(k);
        }
      }
    }
    return { granted, topRole, isApproved, isAdmin: topRole === 'admin' };
  }, [rows, assignments, namedRoles, user?.approvedAt, user?.bannedAt]);

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Roles & permissions \u2014 {user?.fullName ?? user?.email ?? ''}</DialogTitle>
          <DialogDescription>
            Control what this user can do. The Legal Entity / Office Site shown on the user row is their <strong>home</strong> assignment
            (used for default template visibility and serial numbers). The roles below control <strong>what they can do</strong> \u2014 they\u2019re independent.
          </DialogDescription>
        </DialogHeader>

        {/* Section A: Base role */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Base role</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Sets the user\u2019s overall permission level. <strong>Scope</strong> limits where the role applies (everywhere, or only inside one entity / site / department).
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading\u2026</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No base role assigned yet \u2014 user defaults to <Badge variant="secondary" className="capitalize">user</Badge> globally.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map(r => (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="capitalize">{r.role}</Badge>
                    <span className="text-sm text-muted-foreground">{scopeLabelPlain(r.scope_type, r.scope_id)}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add a base role</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Select value={draftRole} onValueChange={(v) => setDraftRole(v as AppRole)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground leading-tight">{ROLE_DESCRIPTIONS[draftRole]}</p>
              </div>
              <div className="space-y-1">
                <Select value={draftScope} onValueChange={(v) => { setDraftScope(v as ScopeType); setDraftScopeId(''); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Everywhere</SelectItem>
                    <SelectItem value="legal_entity">Within a legal entity</SelectItem>
                    <SelectItem value="site">Within a site</SelectItem>
                    <SelectItem value="department">Within a department</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground leading-tight">{SCOPE_DESCRIPTIONS[draftScope]}</p>
              </div>
              <Select
                value={draftScopeId}
                onValueChange={setDraftScopeId}
                disabled={draftScope === 'global'}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={draftScope === 'global' ? 'No target needed' : 'Pick target'} />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} className="h-9">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </section>

        {/* Section B: Named roles */}
        <section className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Named roles</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Reusable bundles of fine-grained permissions (defined in <strong>Admin Portal \u2192 Roles</strong>). Assign one or more on top of the base role.
          </p>

          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No named roles assigned.</p>
          ) : (
            <div className="space-y-1.5">
              {assignments.map(a => {
                const def = namedRoles.find(d => d.id === a.role_definition_id);
                if (!def) return null;
                const enabled = PERMISSION_KEYS.filter(k => def.permissions?.[k]) as PermissionKey[];
                return (
                  <div key={a.id} className="flex items-start justify-between rounded-md border p-2 gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{def.name}</span>
                        <Badge variant="secondary" className="capitalize text-xs">{def.base_role}</Badge>
                      </div>
                      {enabled.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {enabled.map(k => PERMISSION_LABELS[k].title).join(' \u2022 ')}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleUnassignNamed(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Select value={pickRoleId} onValueChange={setPickRoleId} disabled={namedRoles.length === 0}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder={namedRoles.length ? 'Pick a role to assign' : 'No named roles defined yet'} />
              </SelectTrigger>
              <SelectContent>
                {namedRoles
                  .filter(d => !assignments.some(a => a.role_definition_id === d.id))
                  .map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleAssignNamed} disabled={!pickRoleId} className="h-9">
              <Plus className="h-4 w-4 mr-1" /> Assign
            </Button>
          </div>
        </section>

        {/* Section C: Effective permissions */}
        <section className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Effective permissions</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            What this user can actually do once they sign in. Updates live as you change roles above.
            {!effective.isAdmin && !effective.isApproved && ' \u2014 user is not approved yet, so most permissions are off.'}
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PERMISSION_KEYS.map(k => {
              const on = effective.granted.has(k);
              return (
                <div key={k} className={`flex items-center gap-2 rounded-md border p-2 text-xs ${on ? 'bg-primary/5 border-primary/30' : 'opacity-60'}`}>
                  {on
                    ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    : <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <span className="font-medium">{PERMISSION_LABELS[k].title}</span>
                </div>
              );
            })}
          </div>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
