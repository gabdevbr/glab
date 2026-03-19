'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Image, CheckCircle, Loader2 } from 'lucide-react';

const MASKED = '••••••••';

interface GiphyConfig {
  api_key: string;
}

export default function GiphyAdminPage() {
  const [form, setForm] = useState<GiphyConfig>({ api_key: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<GiphyConfig>('/api/v1/admin/giphy/config')
      .then((cfg) => setForm(cfg))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setError('');
    setSaveOk(false);
    setIsSaving(true);
    try {
      await api.put('/api/v1/admin/giphy/config', form);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Image className="size-4" /> Giphy</CardTitle>
          <CardDescription>Configure the Giphy API key to enable the /giphy slash command for searching and sending GIFs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="apikey">API Key</Label>
            <Input
              id="apikey"
              type="password"
              value={form.api_key}
              placeholder={form.api_key === MASKED ? MASKED : 'Enter your Giphy API key'}
              onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Get a free API key at{' '}
              <a href="https://developers.giphy.com/" target="_blank" rel="noreferrer" className="text-link-text underline hover:text-link-hover">
                developers.giphy.com
              </a>
            </p>
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
