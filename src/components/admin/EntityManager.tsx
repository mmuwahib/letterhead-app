import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Entity { id: string; name: string; code: string; }

export default function EntityManager() {
  const [items, setItems] = useState<Entity[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from('legal_entities').select('id, name, code').order('name');
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else setItems(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setEditing(null); setName(''); setCode(''); };

  const save = async () => {
    if (!name.trim()) return toast({ title: 'Name required', variant: 'destructive' });
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      const ok = confirm('You did not set a short code. Document reference numbers for this entity will skip the COMPANY segment. Continue?');
      if (!ok) return;
    }
    try {
      if (editing) {
        const { error } = await supabase.from('legal_entities').update({ name, code: normalizedCode }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('legal_entities').insert({ name, code: normalizedCode });
        if (error) throw error;
      }
      toast({ title: 'Saved' });
      setOpen(false); reset(); load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this entity? Users and templates assigned to it will need re-assignment.')) return;
    const { error } = await supabase.from('legal_entities').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Deleted' }); load(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Legal Entities</CardTitle>
          <CardDescription>Codes are used in document reference numbers.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={reset}><Plus className="mr-2 h-4 w-4" />Add Entity</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Legal Entity</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Gulf Cryo Kuwait" /></div>
              <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="GCKW" maxLength={8} /></div>
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
          <p className="text-sm text-muted-foreground py-6 text-center">No legal entities yet.</p>
        ) : (
          <div className="divide-y">
            {items.map(it => (
              <div key={it.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium text-sm">{it.name}</div>
                  <div className="text-xs font-mono flex items-center gap-1">
                    {it.code ? (
                      <span className="text-muted-foreground">{it.code}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> No code — won't appear in reference numbers
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setName(it.name); setCode(it.code); setOpen(true); }}><Edit2 className="h-3.5 w-3.5" /></Button>
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