export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  role: 'user' | 'admin' | 'agent';
  status: 'online' | 'away' | 'offline' | 'dnd';
  is_bot: boolean;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  slug: string;
  description?: string;
  type: 'public' | 'private' | 'dm';
  topic?: string;
  created_by: string;
  is_archived: boolean;
  created_at: string;
  member_count?: number;
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_bot: boolean;
  thread_id?: string;
  content: string;
  content_type: 'text' | 'file' | 'system';
  edited_at?: string;
  is_pinned: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface WSEnvelope {
  type: string;
  id?: string;
  payload?: unknown;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Agent {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  emoji: string;
  description?: string;
  scope?: string;
  status: string;
  created_at: string;
}

export interface AgentSession {
  id: string;
  agent_id: string;
  user_id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
