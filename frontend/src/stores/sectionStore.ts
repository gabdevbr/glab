import { create } from 'zustand';
import { api } from '@/lib/api';
import { SidebarSection } from '@/lib/types';

interface SectionState {
  sections: SidebarSection[];
  isLoading: boolean;
  fetchSections: () => Promise<void>;
  createSection: (name: string) => Promise<void>;
  renameSection: (id: string, name: string) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  reorderSections: (ids: string[]) => Promise<void>;
  moveChannel: (channelId: string, sectionId: string | null) => Promise<void>;
}

export const useSectionStore = create<SectionState>((set, get) => ({
  sections: [],
  isLoading: false,
  fetchSections: async () => {
    set({ isLoading: true });
    try {
      const sections = await api.listSections<SidebarSection[]>();
      set({ sections, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  createSection: async (name) => {
    try {
      const section = await api.createSection(name);
      set((s) => ({ sections: [...s.sections, section] }));
    } catch {
      // ignore
    }
  },
  renameSection: async (id, name) => {
    // Optimistic update
    const prev = get().sections;
    set((s) => ({
      sections: s.sections.map((sec) => (sec.id === id ? { ...sec, name } : sec)),
    }));
    try {
      await api.updateSection(id, name);
    } catch {
      set({ sections: prev });
    }
  },
  deleteSection: async (id) => {
    const prev = get().sections;
    set((s) => ({ sections: s.sections.filter((sec) => sec.id !== id) }));
    try {
      await api.deleteSection(id);
    } catch {
      set({ sections: prev });
    }
  },
  reorderSections: async (ids) => {
    // Optimistic: reorder locally
    const prev = get().sections;
    const reordered = ids
      .map((id, i) => {
        const sec = prev.find((s) => s.id === id);
        return sec ? { ...sec, position: i } : null;
      })
      .filter(Boolean) as SidebarSection[];
    set({ sections: reordered });
    try {
      await api.reorderSections(ids);
    } catch {
      set({ sections: prev });
    }
  },
  moveChannel: async (channelId, sectionId) => {
    // Optimistic update
    const prev = get().sections;
    set((s) => ({
      sections: s.sections.map((sec) => {
        // Remove channel from all sections first
        const filtered = sec.channel_ids.filter((id) => id !== channelId);
        // Add to target section
        if (sec.id === sectionId) {
          return { ...sec, channel_ids: [...filtered, channelId] };
        }
        return { ...sec, channel_ids: filtered };
      }),
    }));
    try {
      await api.moveChannelToSection(channelId, sectionId);
    } catch {
      set({ sections: prev });
    }
  },
}));
