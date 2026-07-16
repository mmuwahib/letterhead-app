import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function usePendingApprovals() {
  const { role, hasPermission } = useAuth();
  const canApprove = role === 'admin' || hasPermission('approve_users');
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!canApprove) {
      setCount(0);
      return;
    }
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('list_pending_approvals');
      if (!active) return;
      if (error) { setCount(0); return; }
      setCount((data as any[])?.length ?? 0);
    };
    load();
    const id = setInterval(load, 60000);
    return () => { active = false; clearInterval(id); };
  }, [canApprove]);

  return { count, canApprove };
}