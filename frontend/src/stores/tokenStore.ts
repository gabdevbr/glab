import { create } from 'zustand';
import { api } from '@/lib/api';

export interface APIToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at?: string;
  last_used_at?: string;
  is_revoked: boolean;
  created_at: string;
}

interface CreateTokenResponse {
  token: string; // plaintext — shown only once
  data: APIToken;
}

interface TokenState {
  tokens: APIToken[];
  isLoading: boolean;

  fetchTokens: () => Promise<void>;
  createToken: (name: string, scopes: string[], expiresIn?: number) => Promise<string>;
  revokeToken: (id: string) => Promise<void>;
}

export const useTokenStore = create<TokenState>((set) => ({
  tokens: [],
  isLoading: false,

  fetchTokens: async () => {
    set({ isLoading: true });
    try {
      const tokens = await api.get<APIToken[]>('/api/v1/tokens');
      set({ tokens, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createToken: async (name, scopes, expiresIn) => {
    const body: Record<string, unknown> = { name, scopes };
    if (expiresIn) body.expires_in = expiresIn;
    const res = await api.post<CreateTokenResponse>('/api/v1/tokens', body);
    // Refresh list
    const tokens = await api.get<APIToken[]>('/api/v1/tokens');
    set({ tokens });
    return res.token; // plaintext for display
  },

  revokeToken: async (id) => {
    await api.delete(`/api/v1/tokens/${id}`);
    set((s) => ({ tokens: s.tokens.filter((t) => t.id !== id) }));
  },
}));
