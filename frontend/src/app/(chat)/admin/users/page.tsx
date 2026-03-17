'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminStore, AdminUser } from '@/stores/adminStore';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoreHorizontal, UserPlus, Search, Shield, Key, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminUsersPage() {
  const users = useAdminStore((s) => s.users);
  const isLoading = useAdminStore((s) => s.isLoading);
  const fetchUsers = useAdminStore((s) => s.fetchUsers);
  const createUser = useAdminStore((s) => s.createUser);
  const deleteUser = useAdminStore((s) => s.deleteUser);
  const changeRole = useAdminStore((s) => s.changeRole);
  const resetPassword = useAdminStore((s) => s.resetPassword);

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState<AdminUser | null>(null);
  const [showResetDialog, setShowResetDialog] = useState<AdminUser | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<AdminUser | null>(null);
  const [newRole, setNewRole] = useState('user');
  const [newPassword, setNewPassword] = useState('');

  // Create form
  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    display_name: '',
    password: '',
    role: 'user',
  });

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = useCallback(() => {
    fetchUsers(search);
  }, [fetchUsers, search]);

  const handleCreate = async () => {
    try {
      await createUser(createForm);
      setShowCreate(false);
      setCreateForm({ username: '', email: '', display_name: '', password: '', role: 'user' });
      fetchUsers(search);
    } catch {
      // error handled by store
    }
  };

  const handleChangeRole = async () => {
    if (!showRoleDialog) return;
    try {
      await changeRole(showRoleDialog.id, newRole);
      setShowRoleDialog(null);
      fetchUsers(search);
    } catch {
      // ignore
    }
  };

  const handleResetPassword = async () => {
    if (!showResetDialog || !newPassword) return;
    try {
      await resetPassword(showResetDialog.id, newPassword);
      setShowResetDialog(null);
      setNewPassword('');
      fetchUsers(search);
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    if (!showDeleteDialog) return;
    try {
      await deleteUser(showDeleteDialog.id);
      setShowDeleteDialog(null);
      fetchUsers(search);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search users..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleSearch} className="h-8">
            Search
          </Button>
        </div>
        <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowCreate(true)}>
          <UserPlus className="size-3.5" />
          Create User
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[100px]">Role</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No users found
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id} className={cn(u.is_deactivated && 'opacity-50')}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-avatar-bg text-xs font-medium text-avatar-text">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="size-7 rounded-full object-cover" />
                      ) : (
                        u.display_name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.display_name}</p>
                      <p className="text-[11px] text-muted-foreground">@{u.username}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge
                    variant={u.role === 'admin' ? 'default' : u.role === 'agent' ? 'secondary' : 'outline'}
                    className="text-[10px]"
                  >
                    {u.role}
                  </Badge>
                  {u.is_bot && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">BOT</Badge>
                  )}
                  {u.is_deactivated && (
                    <Badge variant="destructive" className="ml-1 text-[10px]">Deactivated</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <span className={cn(
                    'inline-block size-2 rounded-full',
                    u.status === 'online' ? 'bg-status-online'
                    : u.status === 'away' ? 'bg-status-warning'
                    : 'bg-muted',
                  )} />
                </TableCell>
                <TableCell>
                  {!u.is_bot && !u.is_deactivated && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent">
                        <MoreHorizontal className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setShowRoleDialog(u); setNewRole(u.role); }}>
                          <Shield className="mr-2 size-3.5" /> Change Role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowResetDialog(u)}>
                          <Key className="mr-2 size-3.5" /> Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setShowDeleteDialog(u)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 size-3.5" /> Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Username"
              value={createForm.username}
              onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
            />
            <Input
              placeholder="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
            />
            <Input
              placeholder="Display Name"
              value={createForm.display_name}
              onChange={(e) => setCreateForm((p) => ({ ...p, display_name: e.target.value }))}
            />
            <Input
              placeholder="Password"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
            />
            <Select value={createForm.role} onValueChange={(v) => { if (v) setCreateForm((p) => ({ ...p, role: v })); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!createForm.username || !createForm.email || !createForm.password}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={!!showRoleDialog} onOpenChange={() => setShowRoleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role for {showRoleDialog?.display_name}</DialogTitle>
          </DialogHeader>
          <Select value={newRole} onValueChange={(v) => { if (v) setNewRole(v); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(null)}>Cancel</Button>
            <Button onClick={handleChangeRole}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!showResetDialog} onOpenChange={() => { setShowResetDialog(null); setNewPassword(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password for {showResetDialog?.display_name}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowResetDialog(null); setNewPassword(''); }}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={!newPassword}>Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {showDeleteDialog?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the user account. They will no longer be able to log in.
              Their messages will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
