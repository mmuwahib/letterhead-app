import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'manager' | 'user';

export type ScopeType = 'global' | 'legal_entity' | 'site' | 'department';

export interface RoleAssignment {
  role: AppRole;
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface UserProfile {
  id: string;
  userId: string;
  fullName: string | null;
  legalEntityId: string | null;
  officeSiteId: string | null;
  departmentId: string | null;
  onboarded: boolean;
  bannedAt: string | null;
  approvedAt: string | null;
  legalEntityName: string | null;
  officeSiteName: string | null;
  departmentName: string | null;
  tourCompletedAt: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: AppRole;
  roles: RoleAssignment[];
  permissions: Set<string>;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  can: (role: AppRole, scope?: { type: ScopeType; id: string | null }) => boolean;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole>('user');
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (profileError) {
      console.error('Failed to load profile:', profileError);
    }

    if (profileData) {
      const [entityResult, siteResult, departmentResult] = await Promise.all([
        profileData.legal_entity_id
          ? supabase.from('legal_entities').select('name').eq('id', profileData.legal_entity_id).maybeSingle()
          : Promise.resolve({ data: null }),
        profileData.office_site_id
          ? supabase.from('office_sites').select('name').eq('id', profileData.office_site_id).maybeSingle()
          : Promise.resolve({ data: null }),
        profileData.department_id
          ? supabase.from('departments').select('name').eq('id', profileData.department_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setProfile({
        id: profileData.id,
        userId: profileData.user_id,
        fullName: profileData.full_name,
        legalEntityId: profileData.legal_entity_id,
        officeSiteId: profileData.office_site_id,
        departmentId: profileData.department_id,
        onboarded: profileData.onboarded ?? false,
        bannedAt: (profileData as any).banned_at ?? null,
        approvedAt: (profileData as any).approved_at ?? null,
        legalEntityName: (entityResult.data as any)?.name ?? null,
        officeSiteName: (siteResult.data as any)?.name ?? null,
        departmentName: (departmentResult.data as any)?.name ?? null,
        tourCompletedAt: (profileData as any).tour_completed_at ?? null,
      });
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role, scope_type, scope_id')
      .eq('user_id', userId);

    if (roleError) {
      console.error('Failed to load role:', roleError);
    }

    const list: RoleAssignment[] = (roleData ?? []).map((r: any) => ({
      role: r.role as AppRole,
      scopeType: (r.scope_type ?? 'global') as ScopeType,
      scopeId: r.scope_id ?? null,
    }));
    setRoles(list);
    // Highest privilege wins for legacy `role` field.
    const rank: Record<AppRole, number> = { user: 0, manager: 1, admin: 2 };
    const top = list.reduce<AppRole>((acc, r) => (rank[r.role] > rank[acc] ? r.role : acc), 'user');
    setRole(top);

    // Load granular permissions from named role definitions assigned to this user.
    const { data: assignmentData } = await supabase
      .from('user_role_assignments')
      .select('role_definitions(permissions)')
      .eq('user_id', userId);
    const perms = new Set<string>();
    for (const a of (assignmentData ?? []) as any[]) {
      const map = a.role_definitions?.permissions ?? {};
      for (const [k, v] of Object.entries(map)) if (v) perms.add(k);
    }
    setPermissions(perms);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    // Track whether we've completed the very first session resolution. After
    // that, subsequent auth events (TOKEN_REFRESHED, USER_UPDATED, etc.) must
    // NOT flip `loading` back to true — doing so makes <ProtectedRoute /> show
    // its spinner, which unmounts the entire route tree (including the Upload
    // page) and destroys in-memory state like the picked file and preview.
    let initialized = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Only show the global loading spinner on the first resolution.
          // For background events (token refresh, user updated, etc.) we
          // refresh the profile silently so the current page stays mounted.
          if (!initialized) setLoading(true);
          // setTimeout avoids Supabase client deadlock inside the auth callback
          setTimeout(() => {
            fetchProfile(session.user.id).finally(() => {
              if (!initialized) {
                initialized = true;
                setLoading(false);
              }
            });
          }, 0);
        } else {
          setProfile(null);
          setRole('user');
          setRoles([]);
          initialized = true;
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          initialized = true;
          setLoading(false);
        });
      } else {
        initialized = true;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole('user');
    setRoles([]);
    setPermissions(new Set());
  };

  const can = (target: AppRole, scope?: { type: ScopeType; id: string | null }) => {
    return roles.some(r => {
      if (r.role !== target) return false;
      if (r.scopeType === 'global') return true;
      if (!scope) return false;
      return r.scopeType === scope.type && r.scopeId === scope.id;
    });
  };

  // Permission resolution mirrors the SQL helper `user_has_permission`:
  // - admins hold everything
  // - any approved user can upload + view archive (own work)
  // - managers additionally can manage templates + view logs
  // - granular permissions from named roles add on top
  const hasPermission = (perm: string) => {
    if (role === 'admin') return true;
    if ((perm === 'upload' || perm === 'view_archive') && profile?.approvedAt) return true;
    if ((perm === 'manage_templates' || perm === 'view_logs') && role === 'manager') return true;
    return permissions.has(perm);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, role, roles, permissions, loading, signOut, refreshProfile, can, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
