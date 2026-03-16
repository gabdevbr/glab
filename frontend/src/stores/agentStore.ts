import { create } from 'zustand';
import { api } from '@/lib/api';
import { Agent, AgentSession, Message } from '@/lib/types';

interface AgentState {
  agents: Agent[];
  activeAgent: Agent | null;
  sessions: AgentSession[];
  panelMessages: Message[];
  streamingContent: string;
  activeSessionId: string | null;
  isPanelOpen: boolean;
  isLoadingAgents: boolean;
  isLoadingSessions: boolean;
  isLoadingMessages: boolean;

  fetchAgents: () => Promise<void>;
  setActiveAgent: (agent: Agent | null) => void;
  openPanel: (agent: Agent) => void;
  closePanel: () => void;
  fetchSessions: (agentSlug: string) => Promise<void>;
  fetchSessionMessages: (agentSlug: string, sessionId: string) => Promise<void>;
  setActiveSessionId: (id: string | null) => void;
  addPanelMessage: (message: Message) => void;
  appendStreamingContent: (content: string) => void;
  clearStreaming: () => void;
  finalizeStreaming: (messageId: string, agentUserId: string) => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  activeAgent: null,
  sessions: [],
  panelMessages: [],
  streamingContent: '',
  activeSessionId: null,
  isPanelOpen: false,
  isLoadingAgents: false,
  isLoadingSessions: false,
  isLoadingMessages: false,

  fetchAgents: async () => {
    set({ isLoadingAgents: true });
    try {
      const agents = await api.get<Agent[]>('/api/v1/agents');
      set({ agents, isLoadingAgents: false });
    } catch {
      set({ isLoadingAgents: false });
    }
  },

  setActiveAgent: (agent) => set({ activeAgent: agent }),

  openPanel: (agent) => {
    set({
      activeAgent: agent,
      isPanelOpen: true,
      panelMessages: [],
      streamingContent: '',
      activeSessionId: null,
    });
    // Fetch sessions for this agent
    get().fetchSessions(agent.slug);
  },

  closePanel: () =>
    set({
      isPanelOpen: false,
      activeAgent: null,
      panelMessages: [],
      streamingContent: '',
      activeSessionId: null,
    }),

  fetchSessions: async (agentSlug) => {
    set({ isLoadingSessions: true });
    try {
      const sessions = await api.get<AgentSession[]>(
        `/api/v1/agents/${agentSlug}/sessions`,
      );
      set({ sessions, isLoadingSessions: false });
    } catch {
      set({ isLoadingSessions: false });
    }
  },

  fetchSessionMessages: async (agentSlug, sessionId) => {
    set({ isLoadingMessages: true, activeSessionId: sessionId });
    try {
      const messages = await api.get<Message[]>(
        `/api/v1/agents/${agentSlug}/sessions/${sessionId}/messages`,
      );
      set({ panelMessages: messages, isLoadingMessages: false });
    } catch {
      set({ isLoadingMessages: false });
    }
  },

  setActiveSessionId: (id) => set({ activeSessionId: id }),

  addPanelMessage: (message) =>
    set((s) => ({
      panelMessages: [...s.panelMessages, message],
    })),

  appendStreamingContent: (content) =>
    set((s) => ({
      streamingContent: s.streamingContent + content,
    })),

  clearStreaming: () => set({ streamingContent: '' }),

  finalizeStreaming: (messageId, agentUserId) => {
    const state = get();
    if (state.streamingContent) {
      const finalMessage: Message = {
        id: messageId,
        channel_id: '',
        user_id: agentUserId,
        username: state.activeAgent?.slug || '',
        display_name: state.activeAgent?.name || '',
        is_bot: true,
        content: state.streamingContent,
        content_type: 'text',
        is_pinned: false,
        created_at: new Date().toISOString(),
      };
      set((s) => ({
        panelMessages: [...s.panelMessages, finalMessage],
        streamingContent: '',
      }));
    }
  },
}));
