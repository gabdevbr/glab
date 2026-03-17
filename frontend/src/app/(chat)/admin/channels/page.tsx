'use client';

import { useEffect } from 'react';
import { useAdminStore } from '@/stores/adminStore';
import { api } from '@/lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

export default function AdminChannelsPage() {
  const channels = useAdminStore((s) => s.channels);
  const isLoading = useAdminStore((s) => s.isLoading);
  const fetchChannels = useAdminStore((s) => s.fetchChannels);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  async function toggleArchive(channelId: string, currentArchived: boolean) {
    try {
      await api.patch(`/api/v1/channels/${channelId}`, { is_archived: !currentArchived });
      fetchChannels();
    } catch {
      // ignore
    }
  }

  async function handleDelete(channelId: string) {
    try {
      await api.delete(`/api/v1/channels/${channelId}`);
      fetchChannels();
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {channels.length} channels
        </h2>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Channel</TableHead>
              <TableHead className="w-[80px]">Type</TableHead>
              <TableHead className="w-[90px] text-right">Members</TableHead>
              <TableHead className="w-[90px] text-right">Messages</TableHead>
              <TableHead className="w-[90px]">Archived</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && channels.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No channels found
                </TableCell>
              </TableRow>
            )}
            {channels.map((ch) => (
              <TableRow key={ch.id}>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium text-foreground">#{ch.name}</p>
                    <p className="text-[11px] text-muted-foreground">{ch.slug}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={ch.type === 'public' ? 'default' : ch.type === 'private' ? 'secondary' : 'outline'}
                    className="text-[10px]"
                  >
                    {ch.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {formatNumber(ch.member_count)}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {formatNumber(ch.message_count)}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={ch.is_archived}
                    onCheckedChange={() => toggleArchive(ch.id, ch.is_archived)}
                  />
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete #{ch.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the channel and all its messages.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(ch.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
