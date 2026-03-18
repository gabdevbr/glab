export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  role: 'user' | 'admin' | 'agent';
  status: 'online' | 'away' | 'offline' | 'dnd';
  is_bot: boolean;
  auto_hide_days: number;
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
  read_only: boolean;
  retention_days?: number;
  created_at: string;
  member_count?: number;
}

export interface Reaction {
  emoji: string;
  user_id: string;
  username: string;
}

export interface ThreadSummary {
  message_id: string;
  reply_count: number;
  last_reply_at: string;
}

export interface FileAttachment {
  id: string;
  message_id?: string;
  user_id: string;
  channel_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  has_thumbnail: boolean;
  created_at: string;
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
  reactions?: Reaction[];
  thread_summary?: ThreadSummary;
  file?: FileAttachment;
}

export interface SearchResult {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  content_type: string;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_bot: boolean;
  rank: number;
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

// Migration types
export interface MigrationProgress {
  users: number;
  channels: number;
  members: number;
  messages: number;
  reactions: number;
  mentions: number;
  rooms_total: number;
  rooms_done: number;
  files: number;
  emojis: number;
}

export interface MigrationJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  config?: Record<string, unknown>;
  phase: string;
  progress?: MigrationProgress;
  error: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MigrationLog {
  id: number;
  job_id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  phase: string;
  message: string;
  detail?: Record<string, unknown>;
  created_at: string;
}

export interface MigrationRoomState {
  rc_room_id: string;
  rc_room_name: string;
  rc_room_type: string;
  message_count: number;
  latest_export?: string;
  job_id?: string;
  updated_at: string;
}

// Storage config types
export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  access_key_id: string;
  secret_access_key: string;
  key_prefix: string;
  force_path_style: boolean;
}

export interface StorageConfig {
  backend: 'local' | 's3';
  local: { base_dir: string };
  s3: S3StorageConfig;
}

export interface StorageMigrationProgress {
  running: boolean;
  source: string;
  dest: string;
  total: number;
  migrated: number;
  failed: number;
  error?: string;
  file_counts?: Record<string, number>;
}

// AI gateway config types
export interface AIGatewayConfig {
  url: string;
  token: string;
  default_model: string;
}
