'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, Clock } from 'lucide-react';

interface RetentionConfig {
  default_days: number;
  minimum_days: number;
}

export default function RetentionAdminPage() {
  const [config, setConfig] = useState<RetentionConfig>({ default_days: 0, minimum_days: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getRetentionConfig<RetentionConfig>()
      .then((data) => {
        setConfig(data);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  async function handleSave() {
    setError('');
    setSaveOk(false);
    setIsSaving(true);
    try {
      await api.putRetentionConfig(config);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4" /> Message Retention Policy
          </CardTitle>
          <CardDescription>
            Configure how long messages are retained before automatic deletion. Set to 0 to disable retention (keep messages forever).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="default_days">Default retention (days)</Label>
              <Input
                id="default_days"
                type="number"
                min={0}
                value={config.default_days}
                onChange={(e) => setConfig((c) => ({ ...c, default_days: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">
                Applied to channels without a custom retention policy. 0 = keep forever.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minimum_days">Minimum retention (days)</Label>
              <Input
                id="minimum_days"
                type="number"
                min={0}
                value={config.minimum_days}
                onChange={(e) => setConfig((c) => ({ ...c, minimum_days: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">
                Channels cannot set retention below this value.
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center gap-3 border-t pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Save Configuration
            </Button>
            {saveOk && (
              <span className="flex items-center gap-1.5 text-sm text-green-500">
                <CheckCircle className="size-4" /> Saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
