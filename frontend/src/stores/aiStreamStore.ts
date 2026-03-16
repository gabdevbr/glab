import { create } from 'zustand';

interface ChannelStream {
  agentSlug: string;
  agentName: string;
  agentEmoji: string;
  content: string;
}

interface AIStreamState {
  channelStreams: Record<string, ChannelStream>;
  appendChunk: (
    channelId: string,
    agentSlug: string,
    agentName: string,
    agentEmoji: string,
    content: string,
  ) => void;
  clearStream: (channelId: string) => void;
}

export const useAIStreamStore = create<AIStreamState>((set) => ({
  channelStreams: {},

  appendChunk: (channelId, agentSlug, agentName, agentEmoji, content) =>
    set((s) => {
      const existing = s.channelStreams[channelId];
      return {
        channelStreams: {
          ...s.channelStreams,
          [channelId]: {
            agentSlug,
            agentName,
            agentEmoji,
            content: (existing?.content || '') + content,
          },
        },
      };
    }),

  clearStream: (channelId) =>
    set((s) => {
      const updated = { ...s.channelStreams };
      delete updated[channelId];
      return { channelStreams: updated };
    }),
}));
