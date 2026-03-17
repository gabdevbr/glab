'use client';

import { useEffect, useState } from 'react';
import { useAIConfigStore } from '@/stores/aiConfigStore';
import { AIGatewayConfig } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bot, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const MASKED = '••••••••';

type TestResult = { status: 'ok' | 'error'; message: string } | null;

export default function AIAdminPage() {
  const { config, isLoading, isSaving, isTesting, fetchConfig, saveConfig, testConnection } = useAIConfigStore();

  const [form, setForm] = useState<AIGatewayConfig>({ url: '', token: '', default_model: '' });
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const handleTest = async () => {
    setTestResult(null);
    setError('');
    try {
      const res = await testConnection(form);
      setTestResult({ status: res.status as 'ok' | 'error', message: res.message });
    } catch (e: unknown) {
      setTestResult({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const handleSave = async () => {
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

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="size-4" /> AI Gateway</CardTitle>
          <CardDescription>Configure the AI gateway used by agents. Supports any OpenAI-compatible API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gwurl">Gateway URL</Label>
            <Input id="gwurl" placeholder="http://localhost:18789" value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gwtoken">Gateway Token</Label>
            <Input id="gwtoken" type="password"
              value={form.token}
              placeholder={form.token === MASKED ? MASKED : ''}
              onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model">Default Model</Label>
            <Input id="model" placeholder="anthropic/claude-sonnet-4-6" value={form.default_model}
              onChange={(e) => setForm((f) => ({ ...f, default_model: e.target.value }))} />
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 text-sm ${testResult.status === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
              {testResult.status === 'ok' ? <CheckCircle className="size-4" /> : <XCircle className="size-4" />}
              {testResult.message}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center gap-3 border-t pt-4">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting || !form.url}>
              {isTesting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Test Connection
            </Button>
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
