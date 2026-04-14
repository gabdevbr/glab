const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    // Do NOT set Content-Type — browser will set it with boundary for multipart.
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // Channel hide/unhide
  hideChannel(channelId: string, hidden: boolean) {
    return this.patch(`/api/v1/channels/${channelId}/hide`, { hidden });
  }

  // Channel pin/unpin
  pinChannel(channelId: string, pinned: boolean) {
    return this.patch(`/api/v1/channels/${channelId}/pin`, { pinned });
  }

  // Channel members
  listChannelMembers<T>(channelId: string) {
    return this.get<T>(`/api/v1/channels/${channelId}/members`);
  }

  addChannelMember(channelId: string, userId: string) {
    return this.post(`/api/v1/channels/${channelId}/members`, { user_id: userId });
  }

  removeChannelMember(channelId: string, userId: string) {
    return this.delete(`/api/v1/channels/${channelId}/members/${userId}`);
  }

  updateMemberRole(channelId: string, userId: string, role: string) {
    return this.patch(`/api/v1/channels/${channelId}/members/${userId}/role`, { role });
  }

  updateChannel(channelId: string, data: Record<string, unknown>) {
    return this.patch(`/api/v1/channels/${channelId}`, data);
  }

  markAllRead() {
    return this.post('/api/v1/channels/mark-all-read');
  }

  hideAllChannels() {
    return this.post('/api/v1/channels/hide-all');
  }

  listHiddenChannels<T>() {
    return this.get<T>('/api/v1/channels/hidden');
  }

  // User preferences
  updatePreferences(prefs: { auto_hide_days?: number; channel_sort?: string }) {
    return this.patch('/api/v1/users/me/preferences', prefs);
  }

  // Sidebar sections
  listSections<T>() {
    return this.get<T>('/api/v1/sections');
  }

  createSection(name: string) {
    return this.post<{ id: string; name: string; position: number; channel_ids: string[] }>('/api/v1/sections', { name });
  }

  updateSection(id: string, name: string) {
    return this.patch('/api/v1/sections/' + id, { name });
  }

  deleteSection(id: string) {
    return this.delete('/api/v1/sections/' + id);
  }

  reorderSections(sectionIds: string[]) {
    return this.put('/api/v1/sections/reorder', { section_ids: sectionIds });
  }

  moveChannelToSection(channelId: string, sectionId: string | null) {
    return this.patch('/api/v1/sections/move-channel', { channel_id: channelId, section_id: sectionId });
  }

  // Admin: retention config
  getRetentionConfig<T>() {
    return this.get<T>('/api/v1/admin/retention');
  }

  putRetentionConfig(config: { default_days: number; minimum_days: number }) {
    return this.put('/api/v1/admin/retention', config);
  }

  // Admin: message edit timeout
  getEditTimeoutConfig<T>() {
    return this.get<T>('/api/v1/admin/message-edit');
  }

  putEditTimeoutConfig(config: { seconds: number }) {
    return this.put('/api/v1/admin/message-edit', config);
  }
}

export const api = new ApiClient();
