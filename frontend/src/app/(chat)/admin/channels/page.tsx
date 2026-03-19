'use client';

import { useEffect, useState, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2, ArrowUpDown } from 'lucide-react';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

type SortField = 'name' | 'type' | 'member_count' | 'message_count';
type SortDir = 'asc' | 'desc';

export default function AdminChannelsPage() {
  const channels = useAdminStore((s) => s.channels);
  const isLoading = useAdminStore((s) => s.isLoading);
  const fetchChannels = useAdminStore((s) => s.fetchChannels);

  const [typeFilter, setTypeFilter] = useState('all');
  const [archivedFilter, setArchivedFilter] = useState('active');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const filteredChannels = useMemo(() =>
    channels
      .filter(ch => typeFilter === 'all' || ch.type === typeFilter)
      .filter(ch => {
        if (archivedFilter === 'active') return !ch.is_archived;
        if (archivedFilter === 'archived') return ch.is_archived;
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') {
          cmp = a.name.localeCompare(b.name);
        } else if (sortField === 'type') {
          cmp = a.type.localeCompare(b.type);
        } else {
          cmp = (a[sortField] as number) - (b[sortField] as number);
        }
        return sortDir === 'asc' ? cmp : -cmp;
      }),
    [channels, typeFilter, archivedFilter, sortField, sortDir],
  );

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
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-sm font-medium text-muted-foreground">
          {filteredChannels.length} of {channels.length} channels
        </h2>
        <Select value={typeFilter} onValueChange={(v) => { if (v) setTypeFilter(v); }}>
          <SelectTrigger className="h-8 w-[120px] text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="dm">DM</SelectItem>
          </SelectContent>
        </Select>
        <Select value={archivedFilter} onValueChange={(v) => { if (v) setArchivedFilter(v); }}>
          <SelectTrigger className="h-8 w-[120px] text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">
                <button onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-foreground">
                  Channel <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead className="w-[80px]">
                <button onClick={() => toggleSort('type')} className="inline-flex items-center gap-1 hover:text-foreground">
                  Type <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead className="w-[90px] text-right">
                <button onClick={() => toggleSort('member_count')} className="inline-flex items-center gap-1 hover:text-foreground ml-auto">
                  Members <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead className="w-[90px] text-right">
                <button onClick={() => toggleSort('message_count')} className="inline-flex items-center gap-1 hover:text-foreground ml-auto">
                  Messages <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
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
            {!isLoading && filteredChannels.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No channels found
                </TableCell>
              </TableRow>
            )}
            {filteredChannels.map((ch) => (
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
