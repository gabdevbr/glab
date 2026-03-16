'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useChannelStore } from '@/stores/channelStore';
import { Channel } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

export function CreateChannelDialog() {
  const router = useRouter();
  const addChannel = useChannelStore((s) => s.addChannel);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const channel = await api.post<Channel>('/api/v1/channels', {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        description: description || undefined,
        type,
      });
      addChannel(channel);
      setActiveChannel(channel.id);
      setOpen(false);
      resetForm();
      router.push(`/channel/${channel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setName('');
    setDescription('');
    setType('public');
    setError('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger
        render={
          <button className="rounded p-0.5 text-sidebar-section-text transition-colors hover:bg-sidebar-hover hover:text-foreground" />
        }
      >
        <Plus className="size-4" />
      </DialogTrigger>
      <DialogContent className="border-border bg-panel-bg text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create a channel</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Channels are where your team communicates.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="channel-name" className="text-sm font-medium text-muted-foreground">
              Name
            </label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. engineering"
              required
              className="border-chat-input-border bg-chat-input-bg text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="channel-desc" className="text-sm font-medium text-muted-foreground">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="channel-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              rows={2}
              className="rounded-md border border-chat-input-border bg-chat-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-chat-input-focus focus:outline-none focus:ring-1 focus:ring-chat-input-focus"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="channel-type" className="text-sm font-medium text-muted-foreground">
              Type
            </label>
            <select
              id="channel-type"
              value={type}
              onChange={(e) => setType(e.target.value as 'public' | 'private')}
              className="rounded-md border border-chat-input-border bg-chat-input-bg px-3 py-2 text-sm text-foreground focus:border-chat-input-focus focus:outline-none focus:ring-1 focus:ring-chat-input-focus"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          {error && <p className="text-sm text-status-error">{error}</p>}
          <Button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="w-full bg-accent-primary text-accent-primary-text hover:bg-accent-primary-hover"
          >
            {isSubmitting ? 'Creating...' : 'Create Channel'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
