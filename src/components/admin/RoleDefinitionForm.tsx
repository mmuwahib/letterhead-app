import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from '@/lib/permissions';

type AppRole = 'admin' | 'manager' | 'user';
type ScopeType = 'global' | 'legal_entity' | 'site' | 'department';

export interface RoleDefinitionRecord {
  id: string;
  name: string;
  description: string;
  base_role: AppRole;
  scope_type: ScopeType;
  scope_id: string | null;
  permissions: Record<string, boolean>;
}

interface Props {
  open: boolean;
  initial: RoleDefinitionRecord | null;
  legalEntities: { id: string; name: string }[];
  officeSites: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

export function RoleDefinitionForm({ open, initial, legalEntities, officeSites, departments, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseRole, setBaseRole] = useState<AppRole>('user');
  const [scopeType, setScopeType] = useState<ScopeType>('global');
  const [scopeId, setScopeId] = useState<string>('');
  const [perms, setPerms] = useState<Record<PermissionKey, boolean>>(() =>
    Object.fromEntries(PERMISSION_KEYS.map(k => [k, false])) as Record<PermissionKey, boolean>,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setBaseRole(initial?.base_role ?? 'user');
    setScopeType(initial?.scope_type ?? 'global');
    setScopeId(initial?.scope_id ?? '');
    setPerms(
      Object.fromEntries(
        PERMISSION_KEYS.map(k => [k, Boolean(initial?.permissions?.[k])]),
      ) as Record<PermissionKey, boolean>,
    );
  }, [open, initial]);

  const targets =
    scopeType === 'legal_entity' ? legalEntities :
    scopeType === 'site' ? officeSites :
    scopeType === 'department' ? departments : [];

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (scopeType !== 'global' && !scopeId) {
      toast({ title: 'Pick a scope target', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      base_role: baseRole,
      scope_type: scopeType,
      scope_id: scopeType === 'global' ? null : scopeId,
      permissions: perms as unknown as Record<string, boolean>,
    };
    const { error } = initial
      ? await supabase.from('role_definitions').update(payload).eq('id', initial.id)
      : await supabase.from('role_definitions').insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: initial ? 'Role updated' : 'Role created' });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit role' : 'New role'}</DialogTitle>
          <DialogDescription>Define a reusable named role with a scope and granular permissions.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Riyadh Site Manager" />
            </div>
            <div>
              <Label>Base role</Label>
              <Select value={baseRole} onValueChange={v => setBaseRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Scope</Label>
              <Select value={scopeType} onValueChange={v => { setScopeType(v as ScopeType); setScopeId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="legal_entity">Legal entity</SelectItem>
                  <SelectItem value="site">Office site</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target</Label>
              <Select value={scopeId} onValueChange={setScopeId} disabled={scopeType === 'global'}>
                <SelectTrigger>
                  <SelectValue placeholder={scopeType === 'global' ? '—' : 'Pick target'} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium">Permissions</p>
            <div className="space-y-2">
              {PERMISSION_KEYS.map(k => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{PERMISSION_LABELS[k].title}</p>
                    <p className="text-xs text-muted-foreground">{PERMISSION_LABELS[k].hint}</p>
                  </div>
                  <Switch checked={perms[k]} onCheckedChange={(v) => setPerms(p => ({ ...p, [k]: v }))} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save role'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}