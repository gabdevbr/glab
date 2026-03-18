'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, Pencil } from 'lucide-react';

export default function MessagesAdminPage() {
  const [minutes, setMinutes] = useState(15);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getEditTimeoutConfig<{ seconds: number }>()
      .then((data) => {
        setMinutes(Math.round(data.seconds / 60));
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
      await api.putEditTimeoutConfig({ seconds: minutes * 60 });
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
            <Pencil className="size-4" /> Message Edit Timeout
          </CardTitle>
          <CardDescription>
            Set how long users can edit their own messages after sending. Admins can always edit any message regardless of this setting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="edit_timeout">Edit timeout (minutes)</Label>
            <Input
              id="edit_timeout"
              type="number"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Set to 0 to allow editing indefinitely. Current: {minutes} minute{minutes !== 1 ? 's' : ''} ({minutes * 60} seconds).
            </p>
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
