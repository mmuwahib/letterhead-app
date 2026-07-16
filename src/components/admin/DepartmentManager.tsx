import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Dept { id: string; name: string; code: string; }

export default function DepartmentManager() {
  const [items, setItems] = useState<Dept[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const load = async () => {
    const { data } = await supabase.from('departments').select('id, name, code').order('name');
    setItems((data ?? []) as Dept[]);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!name.trim()) return;
    const trimmedCode = code.trim();
    if (trimmedCode && !/^\d+$/.test(trimmedCode)) {
      toast({ title: 'Invalid code', description: 'Department code must be digits only.', variant: 'destructive' });
      return;
    }
    try {
      if (editing) {
        const { error } = await supabase.from('departments').update({ name, code: trimmedCode }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('departments').insert({ name, code: trimmedCode });
        if (error) throw error;
      }
      toast({ title: 'Saved' }); setOpen(false); setEditing(null); setName(''); setCode(''); load();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this department?')) return;
    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Deleted' }); load(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Departments</CardTitle>
          <CardDescription>Used to scope activity logs and document visibility for managers.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setName(''); setCode(''); } }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setName(''); setCode(''); }}><Plus className="mr-2 h-4 w-4" />Add Department</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Department</DialogTitle></DialogHeader>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Operations" /></div>
              <div className="space-y-1.5"><Label>Code</Label><Input inputMode="numeric" pattern="\d*" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="0010" /></div>
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
          <p className="text-sm text-muted-foreground py-6 text-center">No departments yet.</p>
        ) : (
          <div className="divide-y">
            {items.map(it => (
              <div key={it.id} className="flex items-center justify-between py-2">
                <div className="text-sm">
                  <span className="font-medium">{it.name}</span>
                  {it.code && <span className="ml-2 text-xs font-mono text-muted-foreground">[{it.code}]</span>}
                  {!it.code && (
                    <span className="ml-2 text-xs text-destructive">
                      Missing code — references for this department will be incomplete.
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setName(it.name); setCode(it.code ?? ''); setOpen(true); }}><Edit2 className="h-3.5 w-3.5" /></Button>
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