import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Entity { id: string; name: string; }
interface Site { id: string; name: string; code: string; legal_entity_id: string; }

export default function SiteManager() {
  const [items, setItems] = useState<Site[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [entityId, setEntityId] = useState('');

  const load = async () => {
    const [s, e] = await Promise.all([
      supabase.from('office_sites').select('id, name, code, legal_entity_id').order('name'),
      supabase.from('legal_entities').select('id, name').order('name'),
    ]);
    setItems(s.data ?? []);
    setEntities(e.data ?? []);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setEditing(null); setName(''); setCode(''); setEntityId(''); };

  const save = async () => {
    if (!name.trim() || !entityId) return toast({ title: 'Name and entity required', variant: 'destructive' });
    const normalizedCode = code.trim().toUpperCase();
    try {
      if (editing) {
        const { error } = await supabase.from('office_sites').update({ name, code: normalizedCode, legal_entity_id: entityId }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('office_sites').insert({ name, code: normalizedCode, legal_entity_id: entityId });
        if (error) throw error;
      }
      toast({ title: 'Saved' });
      setOpen(false); reset(); load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this site?')) return;
    const { error } = await supabase.from('office_sites').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Deleted' }); load(); }
  };

  const entityName = (id: string) => entities.find(e => e.id === id)?.name ?? '—';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Office Sites</CardTitle>
          <CardDescription>Sites belong to a legal entity. Codes appear in reference numbers.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={reset} disabled={entities.length === 0}><Plus className="mr-2 h-4 w-4" />Add Site</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Office Site</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Legal Entity</Label>
                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
                  <SelectContent>
                    {entities.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Riyadh HQ" /></div>
              <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="RUH" maxLength={8} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No sites yet.</p>
        ) : (
          <div className="divide-y">
            {items.map(it => (
              <div key={it.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    {it.name}
                    {it.code ? (
                      <span className="text-xs text-muted-foreground font-mono">({it.code})</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> no code
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{entityName(it.legal_entity_id)}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setName(it.name); setCode(it.code); setEntityId(it.legal_entity_id); setOpen(true); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}