'use client';

import { useEffect, useState } from 'react';
import { useRCBridgeStore, RCBridgeConfig } from '@/stores/rcBridgeStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ArrowLeftRight, CheckCircle, Loader2, Users } from 'lucide-react';

export default function RCBridgePage() {
  const { config, status, isLoading, isSaving, fetchConfig, fetchStatus, saveConfig } = useRCBridgeStore();
  const [form, setForm] = useState<RCBridgeConfig | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchConfig();
    fetchStatus();
  }, [fetchConfig, fetchStatus]);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const handleSave = async () => {
    if (!form) return;
    setError('');
    setSaveOk(false);
    try {
      await saveConfig(form);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  if (isLoading || !form) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Status card */}
      {status && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="size-4" />
                Active sessions: <span className="font-medium text-foreground">{status.active_sessions}</span>
              </div>
              <Badge variant={status.enabled ? 'default' : 'secondary'}>
                {status.enabled ? 'Bridge active' : 'Bridge disabled'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-4" /> RocketChat Bridge
          </CardTitle>
          <CardDescription>
            Enables realtime bidirectional sync with your RocketChat server. Users log in with their RC credentials; messages persist in Glab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Master toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Enable bridge</p>
              <p className="text-xs text-muted-foreground">Activates RC login and realtime sync.</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => f ? { ...f, enabled: v } : f)}
            />
          </div>

          {/* RC URL */}
          <div className="space-y-1.5">
            <Label htmlFor="rcurl">RocketChat URL</Label>
            <Input
              id="rcurl"
              placeholder="https://chat.geovendas.com"
              value={form.url}
              onChange={(e) => setForm((f) => f ? { ...f, url: e.target.value } : f)}
            />
          </div>

          {/* Login mode */}
          <div className="space-y-1.5">
            <Label htmlFor="loginmode">Login mode</Label>
            <select
              id="loginmode"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.login_mode}
              onChange={(e) => setForm((f) => f ? { ...f, login_mode: e.target.value as RCBridgeConfig['login_mode'] } : f)}
            >
              <option value="dual">Dual — try RC, fall back to local</option>
              <option value="delegated">Delegated — RC only</option>
              <option value="local">Local only — ignore RC</option>
            </select>
          </div>

          {/* Outbound toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Outbound sync (Glab → RC)</p>
              <p className="text-xs text-muted-foreground">Forward messages sent in Glab back to RocketChat.</p>
            </div>
            <Switch
              checked={form.outbound_enabled}
              onCheckedChange={(v) => setForm((f) => f ? { ...f, outbound_enabled: v } : f)}
            />
          </div>

          {/* Max sessions */}
          <div className="space-y-1.5">
            <Label htmlFor="maxsessions">Max concurrent RC sessions</Label>
            <Input
              id="maxsessions"
              type="number"
              min={1}
              max={5000}
              value={form.max_concurrent_sessions}
              onChange={(e) => setForm((f) => f ? { ...f, max_concurrent_sessions: Number(e.target.value) } : f)}
            />
            <p className="text-xs text-muted-foreground">Each active user maintains one DDP connection to RC. Default: 500.</p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center gap-3 border-t pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
            {saveOk && <span className="flex items-center gap-1.5 text-sm text-green-500"><CheckCircle className="size-4" /> Saved</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
