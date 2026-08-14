"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Users, Wifi, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { GuildSummary } from "@/types";
import { guildIconUrl } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export default function ServersPage() {
  const [guilds, setGuilds] = useState<GuildSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ guilds: GuildSummary[] }>("/api/guilds")
      .then((r) => setGuilds(r.guilds))
      .catch(() => setError("Не удалось загрузить список серверов"));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Ваши серверы</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Показаны только сервера, где у вас есть права администратора.
      </p>

      {error && <p className="mt-6 text-sm text-[hsl(var(--destructive))]">{error}</p>}

      {!guilds && !error && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      )}

      {guilds && guilds.length === 0 && (
        <Card className="mt-6 text-center text-muted-foreground">
          Не найдено серверов, где вы администратор.
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guilds?.map((g, i) => {
          const icon = guildIconUrl(g.id, g.icon);
          return (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  {icon ? (
                    <img src={icon} alt={g.name} className="h-12 w-12 rounded-xl" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 font-semibold">
                      {g.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {g.botPresent ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Bot Online
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5 text-[hsl(var(--destructive))]" /> Bot not installed
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {g.memberCount.toLocaleString("ru-RU")} Members
                  </span>
                  <span className="flex items-center gap-1">
                    <Wifi className="h-3.5 w-3.5" /> {g.onlineCount.toLocaleString("ru-RU")} Online
                  </span>
                </div>

                {g.botPresent ? (
                  <Link
                    href={`/servers/${g.id}/dashboard`}
                    className="mt-1 rounded-xl bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground transition-transform hover:scale-[1.02]"
                  >
                    Manage
                  </Link>
                ) : (
                  <a
  href={`https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=8&guild_id=${g.id}`}
                    className="mt-1 rounded-xl border border-border px-4 py-2 text-center text-sm font-medium hover:bg-white/5"
                  >
                    Add Horizon Bot
                  </a>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
