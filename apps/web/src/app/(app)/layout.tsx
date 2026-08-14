"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const isLive = useAppStore((s) => s.isLive);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1">
        <header className="flex items-center justify-end gap-2 border-b border-border px-6 py-3">
          <span
            className={
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
              (isLive
                ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                : "bg-white/5 text-muted-foreground")
            }
          >
            <span
              className={
                "h-1.5 w-1.5 rounded-full " +
                (isLive ? "animate-pulse bg-[hsl(var(--success))]" : "bg-muted-foreground")
              }
            />
            {isLive ? "LIVE" : "OFFLINE"}
          </span>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
