'use client';

import { useState, FormEvent } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const GITHUB_REPO = 'gabdevbr/glab';

interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
  const user = useAuthStore((s) => s.user);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const bodyParts = [
      description,
      '',
      '---',
      `**Reporter:** ${user?.display_name ?? 'unknown'}`,
      `**Page:** ${window.location.href}`,
      `**Browser:** ${navigator.userAgent}`,
      `**Timestamp:** ${new Date().toISOString()}`,
    ];

    const params = new URLSearchParams({
      title,
      body: bodyParts.join('\n'),
      labels: 'bug',
    });

    window.open(
      `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`,
      '_blank',
    );

    setTitle('');
    setDescription('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-panel-bg text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Report a bug</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Opens a GitHub issue pre-filled with context.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="bug-title" className="text-sm font-medium text-muted-foreground">
              Title
            </label>
            <Input
              id="bug-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of the issue"
              required
              className="border-chat-input-border bg-chat-input-bg text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="bug-desc" className="text-sm font-medium text-muted-foreground">
              Description
            </label>
            <textarea
              id="bug-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Steps to reproduce, expected vs actual behavior..."
              rows={4}
              required
              className="rounded-md border border-chat-input-border bg-chat-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-chat-input-focus focus:outline-none focus:ring-1 focus:ring-chat-input-focus"
            />
          </div>
          <Button
            type="submit"
            disabled={!title.trim() || !description.trim()}
            className="w-full bg-accent-primary text-accent-primary-text hover:bg-accent-primary-hover"
          >
            Open GitHub Issue
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
