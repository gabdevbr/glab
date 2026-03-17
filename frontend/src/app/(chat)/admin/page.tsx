'use client';

import { useEffect } from 'react';
import { useAdminStore } from '@/stores/adminStore';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Hash, MessageSquare, File, HardDrive, Wifi, UserPlus, Plus } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

const statCards = [
  { key: 'users' as const, label: 'Users', icon: Users, color: 'text-blue-400' },
  { key: 'channels' as const, label: 'Channels', icon: Hash, color: 'text-green-400' },
  { key: 'messages' as const, label: 'Messages', icon: MessageSquare, color: 'text-purple-400' },
  { key: 'files' as const, label: 'Files', icon: File, color: 'text-orange-400' },
];

export default function AdminDashboard() {
  const stats = useAdminStore((s) => s.stats);
  const fetchStats = useAdminStore((s) => s.fetchStats);
  const router = useRouter();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card, i) => (
          <Card
            key={card.key}
            className="animate-slide-up-fade"
            style={{ animationDelay: `${i * 75}ms`, animationFillMode: 'backwards' }}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <card.icon className={`size-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                {stats ? formatNumber(stats[card.key]) : '—'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card className="animate-slide-up-fade" style={{ animationDelay: '300ms', animationFillMode: 'backwards' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Online Now</CardTitle>
            <Wifi className="size-4 text-status-online" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {stats ? stats.online_count : '—'}
            </p>
          </CardContent>
        </Card>

        <Card className="animate-slide-up-fade" style={{ animationDelay: '375ms', animationFillMode: 'backwards' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Storage</CardTitle>
            <HardDrive className="size-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {stats ? formatBytes(stats.storage_bytes) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push('/admin/users')}
          >
            <UserPlus className="size-3.5" />
            Manage Users
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push('/admin/channels')}
          >
            <Plus className="size-3.5" />
            Manage Channels
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
