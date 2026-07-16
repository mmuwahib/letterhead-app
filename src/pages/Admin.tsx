import { Navigate, useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import EntityManager from '@/components/admin/EntityManager';
import SiteManager from '@/components/admin/SiteManager';
import DepartmentManager from '@/components/admin/DepartmentManager';
import UserManagement from './UserManagement';
import Templates from './Templates';
import RoleDefinitions from './admin/RoleDefinitions';
import { usePageMeta } from '@/hooks/usePageMeta';

const VALID_TABS = ['users', 'roles', 'templates', 'entities', 'sites', 'departments'] as const;

export default function Admin() {
  usePageMeta({ title: 'Admin portal', description: 'Manage entities, sites, departments and roles.', helpKey: '/admin' });
  const { role } = useAuth();
  const [params, setParams] = useSearchParams();
  if (role !== 'admin') return <Navigate to="/" replace />;

  const requested = params.get('tab') ?? 'users';
  const active = (VALID_TABS as readonly string[]).includes(requested) ? requested : 'users';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Admin Portal</h1>
          <p className="text-sm text-muted-foreground">Manage users, templates, organisation structure, and access control.</p>
        </div>
      </div>
      <Tabs value={active} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="templates">Letterhead Templates</TabsTrigger>
          <TabsTrigger value="entities">Legal Entities</TabsTrigger>
          <TabsTrigger value="sites">Office Sites</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4"><UserManagement /></TabsContent>
        <TabsContent value="roles" className="mt-4"><RoleDefinitions /></TabsContent>
        <TabsContent value="templates" className="mt-4"><Templates /></TabsContent>
        <TabsContent value="entities" className="mt-4"><EntityManager /></TabsContent>
        <TabsContent value="sites" className="mt-4"><SiteManager /></TabsContent>
        <TabsContent value="departments" className="mt-4"><DepartmentManager /></TabsContent>
      </Tabs>
    </div>
  );
}