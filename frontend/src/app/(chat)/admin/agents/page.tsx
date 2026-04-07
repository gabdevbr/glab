'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Bot, Plus, Pencil, Trash2, Loader2, Copy, Check } from 'lucide-react';

interface Agent {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  emoji: string;
  description?: string;
  scope?: string;
  status: string;
  gateway_url: string;
  gateway_token?: string;
  model: string;
  system_prompt?: string;
  max_tokens: number;
  temperature: number;
  max_context_messages: number;
  respond_without_mention: boolean;
  category: string;
  created_at: string;
}

const emptyForm = (): Omit<Agent, 'id' | 'user_id' | 'created_at'> => ({
  slug: '',
  name: '',
  emoji: '🤖',
  description: '',
  scope: '',
  status: 'active',
  gateway_url: 'http://192.168.37.206:18789/v1/chat/completions',
  gateway_token: '',
  model: 'anthropic/claude-sonnet-4-6',
  system_prompt: '',
  max_tokens: 4096,
  temperature: 0.7,
  max_context_messages: 8,
  respond_without_mention: false,
  category: '',
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
    </button>
  );
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const data = await api.get<Agent[]>('/api/v1/admin/agents');
      setAgents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAgents(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (agent: Agent) => {
    setEditing(agent);
    setForm({
      slug: agent.slug,
      name: agent.name,
      emoji: agent.emoji || '🤖',
      description: agent.description || '',
      scope: agent.scope || '',
      status: agent.status,
      gateway_url: agent.gateway_url,
      gateway_token: agent.gateway_token || '',
      model: agent.model,
      system_prompt: agent.system_prompt || '',
      max_tokens: agent.max_tokens,
      temperature: agent.temperature,
      max_context_messages: agent.max_context_messages,
      respond_without_mention: agent.respond_without_mention,
      category: agent.category || '',
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.put(`/api/v1/admin/agents/${editing.id}`, form);
      } else {
        await api.post('/api/v1/admin/agents', form);
      }
      setDialogOpen(false);
      await fetchAgents();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agent: Agent) => {
    try {
      await api.delete(`/api/v1/admin/agents/${agent.id}`);
      await fetchAgents();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStatus = async (agent: Agent) => {
    const newStatus = agent.status === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/api/v1/admin/agents/${agent.id}`, {
        ...agent,
        gateway_url: agent.gateway_url,
        status: newStatus,
      });
      setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, status: newStatus } : a));
    } catch (e) {
      console.error(e);
    }
  };

  const F = (key: keyof typeof form) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Bot className="size-5" /> Agents</h2>
          <p className="text-sm text-muted-foreground">Manage AI agents. Each agent has its own user account, gateway, and system prompt.</p>
        </div>
        <Button onClick={openCreate} size="sm"><Plus className="size-4 mr-1" /> New Agent</Button>
      </div>

      <div className="grid gap-4">
        {agents.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No agents yet.</CardContent></Card>
        )}
        {agents.map((agent) => (
          <Card key={agent.id} className={agent.status !== 'active' ? 'opacity-50' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{agent.emoji || '🤖'}</span>
                  <div>
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <CardDescription className="text-xs font-mono">@{agent.slug}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {agent.category && (
                    <Badge variant="outline" className="text-xs">{agent.category}</Badge>
                  )}
                  {agent.respond_without_mention && (
                    <Badge variant="outline" className="text-xs">responde sempre</Badge>
                  )}
                  <Switch
                    checked={agent.status === 'active'}
                    onCheckedChange={() => toggleStatus(agent)}
                    title={agent.status === 'active' ? 'Desativar agent' : 'Ativar agent'}
                  />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(agent)}><Pencil className="size-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={<Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>}
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {agent.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the agent and its bot user.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(agent)} className="bg-destructive">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              {agent.description && <p>{agent.description}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                <span>model: {agent.model}</span>
                <span>max_tokens: {agent.max_tokens}</span>
                <span>ctx: {agent.max_context_messages} msgs</span>
                <span>temp: {agent.temperature}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'New Agent'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input placeholder="Max" {...F('name')} />
              </div>
              <div className="space-y-1.5">
                <Label>Slug * {editing && <span className="text-xs text-muted-foreground">(read-only)</span>}</Label>
                <Input placeholder="max" {...F('slug')} disabled={!!editing} />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Emoji</Label>
                <Input placeholder="🤖" {...F('emoji')} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input placeholder="Ex: Assistentes" {...F('category')} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Description</Label>
                <Input placeholder="Especialista em..." {...F('description')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Gateway URL *</Label>
              <Input placeholder="http://192.168.37.206:18789/v1/chat/completions" {...F('gateway_url')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gateway Token</Label>
                <Input type="password" placeholder="sk-..." {...F('gateway_token')} />
              </div>
              <div className="space-y-1.5">
                <Label>Model *</Label>
                <Input placeholder="anthropic/claude-sonnet-4-6" {...F('model')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>System Prompt</Label>
              <Textarea
                placeholder="Você é o Max, especialista em..."
                rows={6}
                value={form.system_prompt}
                onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Max Tokens</Label>
                <Input type="number" value={form.max_tokens}
                  onChange={(e) => setForm((f) => ({ ...f, max_tokens: parseInt(e.target.value) || 4096 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Temperature</Label>
                <Input type="number" step="0.1" min="0" max="2" value={form.temperature}
                  onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) || 0.7 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Context Messages</Label>
                <Input type="number" value={form.max_context_messages}
                  onChange={(e) => setForm((f) => ({ ...f, max_context_messages: parseInt(e.target.value) || 8 }))} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium text-sm">Responde sem menção</p>
                <p className="text-xs text-muted-foreground">
                  Agente responde a todas as mensagens nos canais, sem precisar de @{form.slug || 'slug'}.
                  Ideal para canais dedicados (ex: #pull-request).
                </p>
              </div>
              <Switch
                checked={form.respond_without_mention}
                onCheckedChange={(v) => setForm((f) => ({ ...f, respond_without_mention: v }))}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
              {editing ? 'Save changes' : 'Create agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
