'use client';

import { useEffect, useState } from 'react';
import { useTokenStore, type APIToken } from '@/stores/tokenStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Copy, Check, Trash2, Key } from 'lucide-react';

const AVAILABLE_SCOPES = [
  { value: 'read:messages', label: 'Read Messages' },
  { value: 'write:messages', label: 'Write Messages' },
  { value: 'read:channels', label: 'Read Channels' },
  { value: 'read:users', label: 'Read Users' },
  { value: 'read:search', label: 'Search' },
  { value: 'admin', label: 'Admin (full access)' },
];

const EXPIRY_OPTIONS = [
  { value: '2592000', label: '30 days' },
  { value: '7776000', label: '90 days' },
  { value: '31536000', label: '1 year' },
  { value: 'never', label: 'Never' },
];

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TokensPage() {
  const { tokens, isLoading, fetchTokens, createToken, revokeToken } = useTokenStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState('never');
  const [creating, setCreating] = useState(false);

  // Token reveal state
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  async function handleCreate() {
    if (!name || selectedScopes.length === 0) return;
    setCreating(true);
    try {
      const expiresIn = expiry === 'never' ? undefined : parseInt(expiry);
      const plaintext = await createToken(name, selectedScopes, expiresIn);
      setRevealedToken(plaintext);
      setName('');
      setSelectedScopes([]);
      setExpiry('never');
      setCreateOpen(false);
    } catch {
      // handled by store
    } finally {
      setCreating(false);
    }
  }

  function handleCopy() {
    if (revealedToken) {
      navigator.clipboard.writeText(revealedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const activeTokens = tokens.filter((t) => !t.is_revoked);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">API Tokens</h2>
          <p className="text-sm text-muted-foreground">
            Manage tokens for programmatic API access
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={<Button size="sm" className="gap-1.5" />}
          >
            <Plus className="size-3.5" />
            Create Token
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Token</DialogTitle>
              <DialogDescription>
                Create a token for programmatic access. The token will only be shown once.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Name</label>
                <Input
                  placeholder="e.g. CI Bot, Webhook Integration"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <button
                      key={scope.value}
                      onClick={() => toggleScope(scope.value)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        selectedScopes.includes(scope.value)
                          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                          : 'border-border text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      {scope.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Expiration
                </label>
                <Select value={expiry} onValueChange={(v) => { if (v) setExpiry(v); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!name || selectedScopes.length === 0 || creating}
              >
                {creating ? 'Creating...' : 'Create Token'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Token reveal dialog */}
      <Dialog open={!!revealedToken} onOpenChange={() => setRevealedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="size-4" />
              Token Created
            </DialogTitle>
            <DialogDescription>
              Copy this token now. You won&apos;t be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="my-2 rounded-md border border-border bg-secondary/50 p-3">
            <code className="break-all text-sm text-foreground">{revealedToken}</code>
          </div>
          <DialogFooter>
            <Button onClick={handleCopy} className="gap-1.5">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied!' : 'Copy Token'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : activeTokens.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/20 p-8 text-center">
          <Key className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No API tokens yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a token to access the Glab API programmatically
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeTokens.map((token) => (
              <TokenRow key={token.id} token={token} onRevoke={revokeToken} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TokenRow({
  token,
  onRevoke,
}: {
  token: APIToken;
  onRevoke: (id: string) => Promise<void>;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{token.name}</TableCell>
      <TableCell>
        <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
          {token.token_prefix}...
        </code>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {token.scopes.map((s) => (
            <Badge key={s} variant="secondary" className="text-[10px]">
              {s}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(token.created_at)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(token.last_used_at)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(token.expires_at)}
      </TableCell>
      <TableCell>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="ghost" size="icon-xs" className="text-destructive" />}
          >
            <Trash2 className="size-3.5" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke token?</AlertDialogTitle>
              <AlertDialogDescription>
                This will immediately revoke &ldquo;{token.name}&rdquo;. Any applications using
                this token will lose access.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onRevoke(token.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Revoke
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
