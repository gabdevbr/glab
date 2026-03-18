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

  listHiddenChannels<T>() {
    return this.get<T>('/api/v1/channels/hidden');
  }

  // User preferences
  updatePreferences(prefs: { auto_hide_days?: number }) {
    return this.patch('/api/v1/users/me/preferences', prefs);
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
