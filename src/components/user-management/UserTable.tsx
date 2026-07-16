import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserCheck, UserX, Ban, ShieldOff, CheckCircle, XCircle, KeyRound, ShieldCheck, Pencil, Trash2 } from 'lucide-react';
import type { AppRole } from '@/contexts/AuthContext';

export interface UserRow {
  userId: string;
  email: string;
  fullName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  legalEntityId: string | null;
  legalEntityName: string | null;
  officeSiteId: string | null;
  officeSiteName: string | null;
  role: AppRole;
  onboarded: boolean;
  createdAt: string;
  bannedAt: string | null;
  approvedAt: string | null;
}

interface Department { id: string; name: string; }
interface LegalEntity { id: string; name: string; }
interface OfficeSite { id: string; name: string; legal_entity_id: string; }

interface UserTableProps {
  users: UserRow[];
  departments: Department[];
  legalEntities?: LegalEntity[];
  officeSites?: OfficeSite[];
  currentUserId: string | undefined;
  onRoleChange: (userId: string, newRole: AppRole) => void;
  onDepartmentChange: (userId: string, deptId: string) => void;
  onLegalEntityChange?: (userId: string, entityId: string) => void;
  onSiteChange?: (userId: string, siteId: string) => void;
  onBanToggle: (user: UserRow) => void;
  onApprove?: (user: UserRow) => void;
  onReject?: (user: UserRow) => void;
  onChangePassword?: (user: UserRow) => void;
  onScopedRoles?: (user: UserRow) => void;
  onEdit?: (user: UserRow) => void;
  onDelete?: (user: UserRow) => void;
}

export function UserTable({ users, departments, legalEntities = [], officeSites = [], currentUserId, onRoleChange, onDepartmentChange, onLegalEntityChange, onSiteChange, onBanToggle, onApprove, onReject, onChangePassword, onScopedRoles, onEdit, onDelete }: UserTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Department</TableHead>
            <TableHead title="Used for default template visibility and serial numbering. Permissions are managed in 'Roles & permissions'.">Legal Entity</TableHead>
            <TableHead title="Used for default template visibility and serial numbering. Permissions are managed in 'Roles & permissions'.">Office Site</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(u => (
            <TableRow key={u.userId}>
              <TableCell>
                <div>
                  <p className="font-medium">{u.fullName ?? 'Unnamed'}</p>
                  {u.email && (
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  )}
                  {u.userId === currentUserId && (
                    <span className="text-xs text-muted-foreground">(You)</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Select
                  value={u.role}
                  onValueChange={(v) => onRoleChange(u.userId, v as AppRole)}
                  disabled={u.userId === currentUserId}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select
                  value={u.departmentId ?? ''}
                  onValueChange={(v) => onDepartmentChange(u.userId, v)}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Assign dept" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {onLegalEntityChange ? (
                  <Select value={u.legalEntityId ?? ''} onValueChange={(v) => onLegalEntityChange(u.userId, v)}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {legalEntities.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <span className="text-sm">{u.legalEntityName ?? '—'}</span>}
              </TableCell>
              <TableCell>
                {onSiteChange ? (
                  <Select value={u.officeSiteId ?? ''} onValueChange={(v) => onSiteChange(u.userId, v)} disabled={!u.legalEntityId}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder={u.legalEntityId ? '—' : 'Pick entity'} /></SelectTrigger>
                    <SelectContent>
                      {officeSites.filter(s => s.legal_entity_id === u.legalEntityId).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : <span className="text-sm">{u.officeSiteName ?? '—'}</span>}
              </TableCell>
              <TableCell>
                {u.bannedAt ? (
                  <Badge variant="destructive" className="gap-1">
                    <Ban className="h-3 w-3" />Banned
                  </Badge>
                ) : !u.approvedAt ? (
                  <Badge className="gap-1 bg-warning/15 text-warning border-warning/30">
                    <UserX className="h-3 w-3" />Pending Approval
                  </Badge>
                ) : u.onboarded ? (
                  <Badge variant="secondary" className="gap-1">
                    <UserCheck className="h-3 w-3" />Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <UserX className="h-3 w-3" />Not Onboarded
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {u.userId !== currentUserId && !u.approvedAt && !u.bannedAt && (
                    <>
                      {onApprove && (
                        <Button variant="outline" size="sm" onClick={() => onApprove(u)}>
                          <CheckCircle className="h-3 w-3 mr-1" />Approve
                        </Button>
                      )}
                      {onReject && (
                        <Button variant="destructive" size="sm" onClick={() => onReject(u)}>
                          <XCircle className="h-3 w-3 mr-1" />Reject
                        </Button>
                      )}
                    </>
                  )}
                  {u.userId !== currentUserId && u.approvedAt && (
                    <Button
                      variant={u.bannedAt ? 'outline' : 'destructive'}
                      size="sm"
                      onClick={() => onBanToggle(u)}
                    >
                      {u.bannedAt ? (
                        <><ShieldOff className="h-3 w-3 mr-1" />Unban</>
                      ) : (
                        <><Ban className="h-3 w-3 mr-1" />Ban</>
                      )}
                    </Button>
                  )}
                  {u.userId !== currentUserId && onChangePassword && (
                    <Button variant="outline" size="sm" onClick={() => onChangePassword(u)}>
                      <KeyRound className="h-3 w-3 mr-1" />Password
                    </Button>
                  )}
                  {u.userId !== currentUserId && onScopedRoles && u.approvedAt && (
                    <Button variant="outline" size="sm" onClick={() => onScopedRoles(u)}>
                      <ShieldCheck className="h-3 w-3 mr-1" />Scopes
                    </Button>
                  )}
                  {onEdit && (
                    <Button variant="outline" size="sm" onClick={() => onEdit(u)}>
                      <Pencil className="h-3 w-3 mr-1" />Edit
                    </Button>
                  )}
                  {u.userId !== currentUserId && onDelete && (
                    <Button variant="destructive" size="sm" onClick={() => onDelete(u)}>
                      <Trash2 className="h-3 w-3 mr-1" />Delete
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
