'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, EyeOff, ArrowUpDown } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'activity', label: 'Recent Activity', desc: 'Most recent conversations first' },
  { value: 'name', label: 'Name (A-Z)', desc: 'Alphabetical order' },
  { value: 'unread', label: 'Unread Count', desc: 'Most unread messages first' },
] as const;

export default function PreferencesPage() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [autoHideDays, setAutoHideDays] = useState(0);
  const [channelSort, setChannelSort] = useState('activity');
  const [isSaving, setIsSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setAutoHideDays(user.auto_hide_days || 0);
      setChannelSort(user.channel_sort || 'activity');
    }
  }, [user]);

  async function handleSave() {
    setError('');
    setSaveOk(false);
    setIsSaving(true);
    try {
      await api.updatePreferences({ auto_hide_days: autoHideDays, channel_sort: channelSort });
      updateUser({ auto_hide_days: autoHideDays, channel_sort: channelSort as 'activity' | 'name' | 'unread' });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
    setIsSaving(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="size-4" /> Channel Visibility
          </CardTitle>
          <CardDescription>
            Automatically hide channels you haven&apos;t interacted with after a period of inactivity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="auto_hide_days">Auto-hide inactive channels after (days)</Label>
            <Input
              id="auto_hide_days"
              type="number"
              min={0}
              value={autoHideDays}
              onChange={(e) => setAutoHideDays(parseInt(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Set to 0 to disable auto-hiding. Channels with unread messages are never auto-hidden.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="size-4" /> Channel Sort Order
          </CardTitle>
          <CardDescription>
            Choose how channels and direct messages are ordered in the sidebar.
            Unread channels always appear at the top regardless of sort order.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {SORT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                channelSort === opt.value
                  ? 'border-accent-primary bg-accent-primary-subtle'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <input
                type="radio"
                name="channel_sort"
                value={opt.value}
                checked={channelSort === opt.value}
                onChange={(e) => setChannelSort(e.target.value)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
          Save Preferences
        </Button>
        {saveOk && (
          <span className="flex items-center gap-1.5 text-sm text-green-500">
            <CheckCircle className="size-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
