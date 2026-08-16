"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { discordAvatarUrl } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Server,
  BrainCircuit,
  ShieldAlert,
  Users,
  Mic,
  BarChart3,
  ScrollText,
  Settings,
  Menu,
  X,
  LogOut,
  Moon,
  Trophy,
} from "lucide-react";

const nav = [
  { href: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "servers", label: "Servers", icon: Server, global: true },
  { href: "ai-analysis", label: "AI Analysis", icon: BrainCircuit },
  { href: "moderation", label: "Moderation", icon: ShieldAlert },
  { href: "members", label: "Members", icon: Users },
  { href: "voice", label: "Voice Manager", icon: Mic },
  { href: "tournaments", label: "Tournaments", icon: Trophy },
  { href: "analytics", label: "Analytics", icon: BarChart3 },
  { href: "logs", label: "Logs", icon: ScrollText },
  { href: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams<{ guildId?: string }>();
  const guildId = params?.guildId;
  const [open, setOpen] = useState(false);
  const user = useAppStore((s) => s.user);
  const isLive = useAppStore((s) => s.isLive);

  const linkFor = (item: (typeof nav)[number]) => {
    if (item.global) return "/servers";
    if (!guildId) return null; // раздел недоступен, пока сервер не выбран
    return `/servers/${guildId}/${item.href}`;
  };

  const handleLogout = async () => {
    await api.post("/logout");
    window.location.href = "/login";
  };

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 py-6">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Horizon Project"
            width={36}
            height={36}
            className="rounded-lg"
            priority
          />
          <span className="font-display text-lg font-bold uppercase tracking-wide">
            Horizon <span className="text-accent">Project</span>
          </span>
        </div>
        <span
          className={isLive ? "pulse-dot" : "pulse-dot pulse-dot-idle"}
          title={isLive ? "Соединение активно" : "Нет соединения"}
          aria-label={isLive ? "Соединение активно" : "Нет соединения"}
        />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const href = linkFor(item);
          const active = !!href && (pathname === href || pathname?.startsWith(href + "/"));

          if (!href) {
            return (
              <div
                key={item.href}
                title="Сначала выберите сервер"
                className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground/40"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border px-3 py-4">
        {user && (
          <div className="flex items-center gap-3 rounded-xl px-3 py-2">
            <img
              src={discordAvatarUrl(user.discordId, user.avatar, 32)}
              alt={user.username}
              className="h-7 w-7 rounded-full"
            />
            <span className="truncate text-sm">{user.username}</span>
          </div>
        )}
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-white/5">
          <Moon className="h-4 w-4" /> Theme
        </button>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-[hsl(var(--destructive))]"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card/50 md:block">{content}</aside>

      {/* Mobile */}
      <button
        onClick={() => setOpen(true)}
        className="glass fixed left-4 top-4 z-40 rounded-xl p-2 md:hidden"
        aria-label="Открыть меню"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-card">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3 p-2">
              <X className="h-5 w-5" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
