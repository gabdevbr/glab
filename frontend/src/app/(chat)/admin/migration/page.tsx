'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useMigrationStore } from '@/stores/migrationStore';
import { wsClient } from '@/lib/ws';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import type { MigrationLog, MigrationProgress, MigrationRoomState } from '@/lib/types';

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-muted-foreground',
  info: 'text-foreground',
  warn: 'text-status-warning',
  error: 'text-status-error',
};

function RoomStatusIcon({ room }: { room: MigrationRoomState }) {
  if (room.message_count > 0 && room.latest_export) {
    return <CheckCircle2 className="size-4 text-status-success" />;
  }
  if (room.latest_export) {
    return <CheckCircle2 className="size-4 text-status-success/50" />;
  }
  return <XCircle className="size-4 text-muted-foreground" />;
}

function RoomTypeLabel({ type }: { type: string }) {
  const labels: Record<string, { text: string; color: string }> = {
    c: { text: 'Channel', color: 'text-status-info' },
    p: { text: 'Private', color: 'text-status-warning' },
    d: { text: 'DM', color: 'text-muted-foreground' },
  };
  const l = labels[type] || { text: type, color: 'text-muted-foreground' };
  return <span className={`text-[10px] font-medium uppercase ${l.color}`}>{l.text}</span>;
}

export default function MigrationPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const {
    job,
    isRunning,
    logs,
    rooms,
    isLoading,
    error,
    fetchStatus,
    fetchLogs,
    fetchRooms,
    startMigration,
    startFileMigration,
    cancelMigration,
    addLog,
    updateStatus,
    updateProgress,
  } = useMigrationStore();

  const [rcUrl, setRcUrl] = useState('https://chat.geovendas.com');
  const [rcToken, setRcToken] = useState('');
  const [rcUserId, setRcUserId] = useState('');
  const [migrateFiles, setMigrateFiles] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [tab, setTab] = useState<'logs' | 'rooms'>('logs');

  const logEndRef = useRef<HTMLDivElement>(null);

  // Load saved migration config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('glab_migration_config');
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.rc_url) setRcUrl(cfg.rc_url);
        if (cfg.rc_token) setRcToken(cfg.rc_token);
        if (cfg.rc_user_id) setRcUserId(cfg.rc_user_id);
        if (cfg.migrate_files !== undefined) setMigrateFiles(cfg.migrate_files);
      }
    } catch { /* ignore */ }
  }, []);

  // Save migration config to localStorage on change
  useEffect(() => {
    localStorage.setItem('glab_migration_config', JSON.stringify({
      rc_url: rcUrl,
      rc_token: rcToken,
      rc_user_id: rcUserId,
      migrate_files: migrateFiles,
    }));
  }, [rcUrl, rcToken, rcUserId, migrateFiles]);

  // Redirect non-admins
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/');
    }
  }, [user, router]);

  // Fetch initial data
  useEffect(() => {
    fetchStatus();
    fetchRooms();
  }, [fetchStatus, fetchRooms]);

  // Fetch logs when job changes
  useEffect(() => {
    if (job?.id) {
      fetchLogs(job.id);
    }
  }, [job?.id, fetchLogs]);

  // Wire WS events
  useEffect(() => {
    const unsubs = [
      wsClient.on('migration.log', (payload: unknown) => {
        addLog(payload as MigrationLog);
      }),
      wsClient.on('migration.status', (payload: unknown) => {
        const data = payload as {
          status: string;
          phase: string;
          progress: MigrationProgress | null;
        };
        updateStatus(data.status, data.phase, data.progress);
        // Refresh rooms when status changes
        if (data.status !== 'running') {
          fetchRooms();
        }
      }),
      wsClient.on('migration.progress', (payload: unknown) => {
        const data = payload as { progress: MigrationProgress };
        updateProgress(data.progress);
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [addLog, updateStatus, updateProgress, fetchRooms]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, autoScroll]);

  async function handleStart() {
    try {
      await startMigration({
        rc_url: rcUrl,
        rc_token: rcToken,
        rc_user_id: rcUserId,
        migrate_files: migrateFiles,
      });
    } catch {
      // error is set in store
    }
  }

  async function handleFileMigration() {
    try {
      await startFileMigration({
        rc_url: rcUrl,
        rc_token: rcToken,
        rc_user_id: rcUserId,
      });
    } catch {
      // error is set in store
    }
  }

  const progress = job?.progress;
  const progressPct =
    progress && progress.rooms_total > 0
      ? Math.round((progress.rooms_done / progress.rooms_total) * 100)
      : 0;

  const statusColor: Record<string, string> = {
    running: 'text-status-info',
    completed: 'text-status-success',
    failed: 'text-status-error',
    cancelled: 'text-status-warning',
    pending: 'text-muted-foreground',
  };

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-chat-bg">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => router.push('/')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">RocketChat Migration</h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
        {/* Config Form */}
        <div className="rounded-lg border border-border bg-panel-bg p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">RC URL</label>
              <Input
                value={rcUrl}
                onChange={(e) => setRcUrl(e.target.value)}
                className="border-chat-input-border bg-chat-input-bg text-sm text-foreground"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">RC User ID</label>
              <Input
                value={rcUserId}
                onChange={(e) => setRcUserId(e.target.value)}
                className="border-chat-input-border bg-chat-input-bg text-sm text-foreground"
                disabled={isRunning}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">RC Auth Token</label>
              <Input
                type="password"
                value={rcToken}
                onChange={(e) => setRcToken(e.target.value)}
                className="border-chat-input-border bg-chat-input-bg text-sm text-foreground"
                disabled={isRunning}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={migrateFiles}
                onChange={(e) => setMigrateFiles(e.target.checked)}
                disabled={isRunning}
                className="rounded border-chat-input-focus"
              />
              Migrate files
            </label>
            <div className="flex gap-2">
              {isRunning ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={cancelMigration}
                  className="gap-1.5"
                >
                  <Square className="size-3.5" /> Cancel
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={handleStart}
                    disabled={isLoading || !rcToken || !rcUserId}
                    className="gap-1.5 bg-accent-primary hover:bg-accent-primary-hover"
                  >
                    {isLoading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    Start Migration
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFileMigration}
                    disabled={isLoading || !rcToken || !rcUserId}
                    className="gap-1.5 border-border text-foreground"
                  >
                    {isLoading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    Download Files
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchStatus();
                  fetchRooms();
                }}
                className="gap-1.5 border-border text-foreground"
              >
                <RefreshCw className="size-3.5" /> Refresh
              </Button>
            </div>
          </div>

          {error && (
            <p className="mt-2 text-sm text-status-error">{error}</p>
          )}
        </div>

        {/* Status Bar */}
        {job && (
          <div className="rounded-lg border border-border bg-panel-bg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium capitalize ${statusColor[job.status] || 'text-muted-foreground'}`}>
                  {job.status}
                </span>
                {job.phase && (
                  <span className="text-xs text-muted-foreground">
                    Phase: <span className="text-foreground">{job.phase}</span>
                  </span>
                )}
              </div>
              {job.error && <span className="text-xs text-status-error">{job.error}</span>}
            </div>

            {/* Progress Bar */}
            {progress && progress.rooms_total > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Rooms: {progress.rooms_done}/{progress.rooms_total}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-status-info transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Stats */}
            {progress && (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Users: <span className="text-foreground">{progress.users.toLocaleString()}</span></span>
                <span>Channels: <span className="text-foreground">{progress.channels.toLocaleString()}</span></span>
                <span>Messages: <span className="text-foreground">{progress.messages.toLocaleString()}</span></span>
                <span>Reactions: <span className="text-foreground">{progress.reactions.toLocaleString()}</span></span>
                <span>Mentions: <span className="text-foreground">{progress.mentions.toLocaleString()}</span></span>
                {progress.files > 0 && (
                  <span>Files: <span className="text-foreground">{progress.files.toLocaleString()}</span></span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex gap-1">
          <button
            onClick={() => setTab('logs')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === 'logs'
                ? 'bg-panel-bg text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Logs
          </button>
          <button
            onClick={() => setTab('rooms')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === 'rooms'
                ? 'bg-panel-bg text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Rooms ({rooms.length})
          </button>
        </div>

        {/* Logs Panel */}
        {tab === 'logs' && (
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-panel-bg">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="text-xs text-muted-foreground">{logs.length} log entries</span>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-chat-input-focus"
                />
                Auto-scroll
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">No logs yet. Start a migration to see output.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-2 py-0.5">
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                    <span
                      className={`w-12 shrink-0 text-right font-semibold uppercase ${LEVEL_COLORS[log.level] || 'text-muted-foreground'}`}
                    >
                      {log.level}
                    </span>
                    {log.phase && (
                      <span className="shrink-0 text-muted-foreground">[{log.phase}]</span>
                    )}
                    <span className={LEVEL_COLORS[log.level] || 'text-foreground'}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Rooms Panel */}
        {tab === 'rooms' && (
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-panel-bg">
            <div className="border-b border-border px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {rooms.filter((r) => r.message_count > 0).length} migrated / {rooms.length} total
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {rooms.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  No room data yet. Run a migration to see room status.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-panel-bg">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Room</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 text-right font-medium">Messages</th>
                      <th className="px-4 py-2 font-medium">Last Export</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room) => (
                      <tr
                        key={room.rc_room_id}
                        className="border-b border-border/50 hover:bg-chat-hover"
                      >
                        <td className="px-4 py-1.5">
                          {isRunning && !room.latest_export ? (
                            <Clock className="size-4 text-status-info animate-pulse" />
                          ) : (
                            <RoomStatusIcon room={room} />
                          )}
                        </td>
                        <td className="px-4 py-1.5 text-foreground">
                          {room.rc_room_name || room.rc_room_id}
                        </td>
                        <td className="px-4 py-1.5">
                          <RoomTypeLabel type={room.rc_room_type} />
                        </td>
                        <td className="px-4 py-1.5 text-right text-foreground">
                          {room.message_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-1.5 text-muted-foreground">
                          {room.latest_export
                            ? new Date(room.latest_export).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
