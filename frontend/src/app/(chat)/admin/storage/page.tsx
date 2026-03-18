'use client';

import { useEffect, useState } from 'react';
import { useStorageStore } from '@/stores/storageStore';
import { wsClient } from '@/lib/ws';
import { StorageConfig, StorageMigrationProgress } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { HardDrive, Cloud, CheckCircle, XCircle, Loader2, Trash2, AlertTriangle } from 'lucide-react';

const MASKED = '••••••••';

const S3_PRESETS: Record<string, Partial<{ endpoint: string; region: string }>> = {
  aws: { endpoint: '', region: 'us-east-1' },
  ibm: { endpoint: 'https://s3.us-south.cloud-object-storage.appdomain.cloud', region: 'us-south' },
  zadara: { endpoint: 'https://s3.symphony.zadara.com', region: 'us-east-1' },
  minio: { endpoint: 'http://localhost:9000', region: 'us-east-1' },
  custom: {},
};

type TestResult = { status: 'ok' | 'error'; message: string } | null;

function pct(migrated: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((migrated / total) * 100));
}

export default function StorageAdminPage() {
  const { config, migration, isLoading, isSaving, isTesting, isDeleting, fetchConfig, saveConfig, testConnection, fetchMigrationStatus, startMigration, cancelMigration, updateMigrationProgress, deleteAllFiles } = useStorageStore();

  const [form, setForm] = useState<StorageConfig>({
    backend: 'local',
    local: { base_dir: '' },
    s3: { endpoint: '', region: '', bucket: '', access_key_id: '', secret_access_key: '', key_prefix: '', force_path_style: false },
  });
  const [preset, setPreset] = useState('aws');
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
    fetchMigrationStatus();
  }, [fetchConfig, fetchMigrationStatus]);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  // Live migration progress via WebSocket
  useEffect(() => {
    return wsClient.on('storage.migration.progress', (payload) => {
      updateMigrationProgress(payload as StorageMigrationProgress);
    });
  }, [updateMigrationProgress]);

  const handlePreset = (p: string) => {
    setPreset(p);
    const pre = S3_PRESETS[p] ?? {};
    setForm((f) => ({ ...f, s3: { ...f.s3, ...pre } }));
  };

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

  const handleDeleteAllFiles = async () => {
    setError('');
    setDeleteResult(null);
    try {
      const res = await deleteAllFiles();
      setDeleteResult(`${res.deleted} files deleted`);
      setConfirmDelete(false);
      fetchMigrationStatus(); // refresh file counts
      setTimeout(() => setDeleteResult(null), 5000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete files');
      setConfirmDelete(false);
    }
  };

  const handleStartMigration = async (source: string, dest: string) => {
    setError('');
    try {
      await startMigration(source, dest);
      fetchMigrationStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start migration');
    }
  };

  const fileCounts = (migration as (StorageMigrationProgress & { file_counts?: Record<string, number> }) | null)?.file_counts ?? {};
  const localCount = fileCounts['local'] ?? 0;
  const s3Count = fileCounts['s3'] ?? 0;

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HardDrive className="size-4" /> Storage Backend</CardTitle>
          <CardDescription>Choose where uploaded files are stored. Changes take effect immediately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Backend selector */}
          <RadioGroup
            value={form.backend}
            onValueChange={(v) => setForm((f) => ({ ...f, backend: v as 'local' | 's3' }))}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="local" id="local" />
              <Label htmlFor="local" className="flex items-center gap-1.5 cursor-pointer"><HardDrive className="size-3.5" /> Local Filesystem</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="s3" id="s3" />
              <Label htmlFor="s3" className="flex items-center gap-1.5 cursor-pointer"><Cloud className="size-3.5" /> S3-Compatible</Label>
            </div>
          </RadioGroup>

          {/* S3 config */}
          {form.backend === 's3' && (
            <div className="space-y-4 border-t pt-4">
              {/* Provider presets */}
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(S3_PRESETS).map((p) => (
                    <Button
                      key={p}
                      variant={preset === p ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePreset(p)}
                    >
                      {p === 'aws' ? 'Amazon S3' : p === 'ibm' ? 'IBM COS' : p === 'zadara' ? 'Zadara' : p === 'minio' ? 'MinIO' : 'Custom'}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="endpoint">Endpoint URL</Label>
                  <Input id="endpoint" placeholder="https://s3.amazonaws.com" value={form.s3.endpoint}
                    onChange={(e) => setForm((f) => ({ ...f, s3: { ...f.s3, endpoint: e.target.value } }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="region">Region</Label>
                  <Input id="region" placeholder="us-east-1" value={form.s3.region}
                    onChange={(e) => setForm((f) => ({ ...f, s3: { ...f.s3, region: e.target.value } }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bucket">Bucket</Label>
                  <Input id="bucket" placeholder="my-glab-files" value={form.s3.bucket}
                    onChange={(e) => setForm((f) => ({ ...f, s3: { ...f.s3, bucket: e.target.value } }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prefix">Key Prefix (optional)</Label>
                  <Input id="prefix" placeholder="uploads/" value={form.s3.key_prefix}
                    onChange={(e) => setForm((f) => ({ ...f, s3: { ...f.s3, key_prefix: e.target.value } }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="keyid">Access Key ID</Label>
                  <Input id="keyid" value={form.s3.access_key_id}
                    onChange={(e) => setForm((f) => ({ ...f, s3: { ...f.s3, access_key_id: e.target.value } }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="secret">Secret Access Key</Label>
                  <Input id="secret" type="password"
                    value={form.s3.secret_access_key}
                    placeholder={form.s3.secret_access_key === MASKED ? MASKED : ''}
                    onChange={(e) => setForm((f) => ({ ...f, s3: { ...f.s3, secret_access_key: e.target.value } }))} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch id="pathstyle" checked={form.s3.force_path_style}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, s3: { ...f.s3, force_path_style: v } }))} />
                <Label htmlFor="pathstyle" className="cursor-pointer">Force path-style URLs (required for MinIO/Zadara)</Label>
              </div>

              {/* Test result */}
              {testResult && (
                <div className={`flex items-center gap-2 text-sm ${testResult.status === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                  {testResult.status === 'ok' ? <CheckCircle className="size-4" /> : <XCircle className="size-4" />}
                  {testResult.message}
                </div>
              )}

              <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
                {isTesting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Test Connection
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center gap-3 border-t pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Save Configuration
            </Button>
            {saveOk && <span className="flex items-center gap-1.5 text-sm text-green-500"><CheckCircle className="size-4" /> Saved</span>}
          </div>
        </CardContent>
      </Card>

      {/* Migration */}
      <Card>
        <CardHeader>
          <CardTitle>File Migration</CardTitle>
          <CardDescription>Copy existing files between backends. Files are served from their current backend during migration — no downtime.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-6 text-sm">
            <span>Local: <strong>{localCount}</strong> files</span>
            <span>S3: <strong>{s3Count}</strong> files</span>
          </div>

          {migration?.running ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{migration.source} → {migration.dest}</span>
                <span>{migration.migrated} / {migration.total} ({pct(migration.migrated, migration.total)}%)</span>
              </div>
              <Progress value={pct(migration.migrated, migration.total)} className="h-2" />
              {migration.failed > 0 && <p className="text-xs text-yellow-500">{migration.failed} failed</p>}
              {migration.error && <p className="text-xs text-red-500">{migration.error}</p>}
              <Button variant="outline" size="sm" onClick={cancelMigration}>Cancel</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {localCount > 0 && (
                <Button variant="outline" size="sm" onClick={() => handleStartMigration('local', 's3')} disabled={s3Count === 0 && form.backend !== 's3'}>
                  Migrate Local → S3
                </Button>
              )}
              {s3Count > 0 && (
                <Button variant="outline" size="sm" onClick={() => handleStartMigration('s3', 'local')}>
                  Migrate S3 → Local
                </Button>
              )}
              {localCount === 0 && s3Count === 0 && (
                <p className="text-sm text-muted-foreground">No files to migrate.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone — Delete All Files */}
      <Card className="border-red-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500"><Trash2 className="size-4" /> Danger Zone</CardTitle>
          <CardDescription>Permanently delete all uploaded files from storage and database. Use this before re-importing files from RocketChat.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-6 text-sm">
            <span>Total files: <strong>{localCount + s3Count}</strong></span>
          </div>

          {deleteResult && (
            <p className="flex items-center gap-1.5 text-sm text-green-500"><CheckCircle className="size-4" /> {deleteResult}</p>
          )}

          {!confirmDelete ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={localCount + s3Count === 0}>
              <Trash2 className="size-3.5 mr-1.5" />
              Delete All Files
            </Button>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
              <AlertTriangle className="size-5 text-red-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-500">This will permanently delete {localCount + s3Count} files.</p>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" onClick={handleDeleteAllFiles} disabled={isDeleting}>
                  {isDeleting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                  Confirm Delete
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
