import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { RoleDefinitionForm, type RoleDefinitionRecord } from '@/components/admin/RoleDefinitionForm';
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from '@/lib/permissions';

export default function RoleDefinitions() {
  const [rows, setRows] = useState<RoleDefinitionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [legalEntities, setLegalEntities] = useState<{ id: string; name: string }[]>([]);
  const [officeSites, setOfficeSites] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<RoleDefinitionRecord | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, le, os, dp] = await Promise.all([
      supabase.from('role_definitions').select('*').order('name'),
      supabase.from('legal_entities').select('id, name'),
      supabase.from('office_sites').select('id, name'),
      supabase.from('departments').select('id, name'),
    ]);
    if (error) {
      toast({ title: 'Failed to load roles', description: error.message, variant: 'destructive' });
    } else {
      setRows((data ?? []).map(r => ({ ...r, permissions: (r.permissions ?? {}) as Record<string, boolean> })) as RoleDefinitionRecord[]);
    }
    setLegalEntities(le.data ?? []);
    setOfficeSites(os.data ?? []);
    setDepartments(dp.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (r: RoleDefinitionRecord) => {
    if (!confirm(`Delete role "${r.name}"? This will remove it from all users it is assigned to.`)) return;
    const { error } = await supabase.from('role_definitions').delete().eq('id', r.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Role deleted' });
    load();
  };

  const scopeLabel = (r: RoleDefinitionRecord) => {
    if (r.scope_type === 'global') return 'Global';
    const list = r.scope_type === 'legal_entity' ? legalEntities : r.scope_type === 'site' ? officeSites : departments;
    const target = list.find(x => x.id === r.scope_id)?.name ?? '—';
    const label = r.scope_type === 'legal_entity' ? 'Legal entity' : r.scope_type === 'site' ? 'Site' : 'Department';
    return `${label} · ${target}`;
  };

  return (
    <div className="space-y-4">
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-4 text-sm space-y-2">
        <p className="font-medium">How roles work</p>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
          <li><strong>Base role</strong> sets the broad permission level (admin / manager / user).</li>
          <li><strong>Scope</strong> restricts where the role applies (everywhere, or limited to one legal entity / site / department).</li>
          <li><strong>Permissions</strong> are extra granular capabilities layered on top of the base role.</li>
        </ul>
        <p className="text-xs text-muted-foreground">Assign these to users from <strong>User Management → user row → “Roles &amp; permissions”</strong>.</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Role Definitions
        </CardTitle>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New role
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No roles yet. Create your first reusable role to assign to users.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map(r => {
              const enabled = PERMISSION_KEYS.filter(k => r.permissions?.[k]) as PermissionKey[];
              return (
                <div key={r.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{r.name}</p>
                        <Badge variant="secondary" className="capitalize">{r.base_role}</Badge>
                        <Badge variant="outline">{scopeLabel(r)}</Badge>
                      </div>
                      {r.description && (
                        <p className="text-sm text-muted-foreground mt-1">{r.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {enabled.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {enabled.map(k => (
                        <Badge key={k} variant="outline" className="text-xs">
                          {PERMISSION_LABELS[k].title}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <RoleDefinitionForm
        open={open}
        initial={editing}
        legalEntities={legalEntities}
        officeSites={officeSites}
        departments={departments}
        onClose={() => setOpen(false)}
        onSaved={load}
      />
    </Card>
    </div>
  );
}