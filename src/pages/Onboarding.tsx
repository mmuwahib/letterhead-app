import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import JoinStepper from '@/components/navigation/JoinStepper';

interface LegalEntity { id: string; name: string; }
interface OfficeSite { id: string; name: string; legal_entity_id: string; }
interface Department { id: string; name: string; }

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [sites, setSites] = useState<OfficeSite[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedEntity, setSelectedEntity] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [entRes, siteRes, deptRes] = await Promise.all([
        supabase.from('legal_entities').select('id, name').order('name'),
        supabase.from('office_sites').select('id, name, legal_entity_id').order('name'),
        supabase.from('departments').select('id, name').order('name'),
      ]);
      if (entRes.data) setEntities(entRes.data);
      if (siteRes.data) setSites(siteRes.data);
      if (deptRes.data) setDepartments(deptRes.data);
    };
    fetchData();
  }, []);

  const filteredSites = sites.filter(s => s.legal_entity_id === selectedEntity);

  useEffect(() => {
    // Reset site when entity changes
    setSelectedSite('');
  }, [selectedEntity]);

  const handleSubmit = async () => {
    if (!selectedEntity || !selectedSite || !selectedDept) {
      toast({ title: 'Error', description: 'Please fill all fields', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          legal_entity_id: selectedEntity,
          office_site_id: selectedSite,
          department_id: selectedDept,
          onboarded: true,
        })
        .eq('user_id', user!.id);
      if (error) throw error;
      await refreshProfile();
      navigate('/');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <div className="w-full max-w-lg">
        <JoinStepper current="profile" />
      </div>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            GC
          </div>
          <CardTitle className="text-2xl">Tell us where you work</CardTitle>
          <CardDescription>
            Takes about 30 seconds. We use this to scope what you see and to route documents correctly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Legal Entity</Label>
            <Select value={selectedEntity} onValueChange={setSelectedEntity}>
              <SelectTrigger><SelectValue placeholder="Select legal entity" /></SelectTrigger>
              <SelectContent>
                {entities.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Office Site</Label>
            <Select value={selectedSite} onValueChange={setSelectedSite} disabled={!selectedEntity}>
              <SelectTrigger><SelectValue placeholder={selectedEntity ? 'Select office site' : 'Select entity first'} /></SelectTrigger>
              <SelectContent>
                {filteredSites.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={selectedDept} onValueChange={setSelectedDept}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Continue to Dashboard'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
