'use client';

import { useState, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Camera, ChevronDown, ChevronRight, LogOut, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

function getAvatarSrc(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/')) return `${API_URL}${url}`;
  return url;
}

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Password section
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setDisplayName(user?.display_name || '');
    setEmail(user?.email || '');
    setAvatarPreview(null);
    setAvatarFile(null);
    setError('');
    setShowPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
  }, [user]);

  const handleOpenChange = (next: boolean) => {
    if (next) resetForm();
    onOpenChange(next);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError('');
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');

    try {
      // Upload avatar if changed
      if (avatarFile) {
        const formData = new FormData();
        formData.append('file', avatarFile);
        await api.upload<User>(`/api/v1/users/${user.id}/avatar`, formData);
      }

      // Update profile fields
      const updated = await api.patch<User>(`/api/v1/users/${user.id}`, {
        display_name: displayName,
        email,
      });

      // Re-fetch to get resolved avatar URL
      const fresh = await api.get<User>('/api/v1/auth/me');
      updateUser(fresh);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    try {
      await api.post('/api/v1/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  const handleLogout = () => {
    onOpenChange(false);
    logout();
    router.push('/login');
  };

  if (!user) return null;

  const currentAvatarSrc = avatarPreview || getAvatarSrc(user.avatar_url);
  const initials = user.display_name?.charAt(0).toUpperCase() || '?';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update your profile information.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Avatar */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleAvatarClick}
              className="group relative flex size-20 items-center justify-center rounded-full bg-accent-primary text-2xl font-bold text-accent-primary-text overflow-hidden transition-all hover:ring-2 hover:ring-ring"
            >
              {currentAvatarSrc ? (
                <img
                  src={currentAvatarSrc}
                  alt={user.display_name}
                  className="size-20 rounded-full object-cover"
                />
              ) : (
                initials
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="size-5 text-white" />
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          {/* Username (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Username</label>
            <Input value={user.username} disabled className="opacity-60" />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {/* Password section */}
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Change Password
          </button>

          {showPassword && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Current Password</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Confirm New Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-xs text-green-600 dark:text-green-400">{passwordSuccess}</p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handlePasswordChange}
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Update Password
              </Button>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="mr-auto text-muted-foreground hover:text-destructive"
          >
            <LogOut className="mr-1.5 size-3.5" />
            Log Out
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
