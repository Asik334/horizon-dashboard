import { create } from "zustand";
import { DashboardUser, GuildSummary } from "@/types";

interface AppState {
  user: DashboardUser | null;
  setUser: (user: DashboardUser | null) => void;

  guilds: GuildSummary[];
  setGuilds: (guilds: GuildSummary[]) => void;

  activeGuildId: string | null;
  setActiveGuildId: (id: string | null) => void;

  isLive: boolean;
  setIsLive: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  guilds: [],
  setGuilds: (guilds) => set({ guilds }),

  activeGuildId: null,
  setActiveGuildId: (id) => set({ activeGuildId: id }),

  isLive: false,
  setIsLive: (v) => set({ isLive: v }),
}));
