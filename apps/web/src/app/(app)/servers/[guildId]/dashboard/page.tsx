"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Users, Wifi, MessageSquare, ShieldAlert, Ban, Bot } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { StatCard, Card } from "@/components/ui/card";
import { useGuildSocket } from "@/hooks/useGuildSocket";
import { AnalyticsPoint, GuildSummary } from "@/types";

export default function GuildDashboardPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [guild, setGuild] = useState<GuildSummary | null>(null);
  const [analytics7d, setAnalytics7d] = useState<AnalyticsPoint[]>([]);
  const [analytics24h, setAnalytics24h] = useState<AnalyticsPoint[]>([]);
  const [warnings, setWarnings] = useState(0);
  const [bans, setBans] = useState(0);

  useGuildSocket(guildId, (msg) => {
    if (msg.type === "moderation:new") {
      const payload = msg.payload as { action: string };
      if (payload.action === "WARN") setWarnings((w) => w + 1);
      if (payload.action === "BAN") setBans((b) => b + 1);
    }
  });

  useEffect(() => {
    if (!guildId) return;
    api.get<{ guild: GuildSummary }>(`/api/guilds/${guildId}`).then((r) => setGuild(r.guild)).catch(() => {});
    api
      .get<{ data: AnalyticsPoint[] }>(`/api/guilds/${guildId}/analytics?period=7d`)
      .then((r) => setAnalytics7d(r.data))
      .catch(() => {});
    api
      .get<{ data: AnalyticsPoint[] }>(`/api/guilds/${guildId}/analytics?period=24h`)
      .then((r) => setAnalytics24h(r.data))
      .catch(() => {});
    api
      .get<{ logs: { action: string }[] }>(`/api/guilds/${guildId}/moderation/logs?pageSize=100`)
      .then((r) => {
        setWarnings(r.logs.filter((l) => l.action === "WARN").length);
        setBans(r.logs.filter((l) => l.action === "BAN").length);
      })
      .catch(() => {});
  }, [guildId]);

  const messages24h = analytics24h.reduce((sum, p) => sum + p.messageCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{guild?.name ?? "Dashboard"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Обзор активности сервера в реальном времени</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Members" value={(guild?.memberCount ?? 0).toLocaleString("ru-RU")} icon={Users} />
        <StatCard label="Online" value={(guild?.onlineCount ?? 0).toLocaleString("ru-RU")} icon={Wifi} accent="success" />
        <StatCard label="Messages (24h)" value={messages24h.toLocaleString("ru-RU")} icon={MessageSquare} />
        <StatCard label="Warnings" value={warnings} icon={ShieldAlert} accent="warning" />
        <StatCard label="Bans" value={bans} icon={Ban} accent="destructive" />
        <StatCard label="Bot Status" value={guild ? "Online" : "…"} icon={Bot} accent="success" pulse={!!guild} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Активность за 7 дней</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={analytics7d}>
              <defs>
                <linearGradient id="msg7d" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(154 78% 51%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(154 78% 51%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 16%)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                stroke="hsl(240 6% 60%)"
                fontSize={12}
              />
              <YAxis stroke="hsl(240 6% 60%)" fontSize={12} />
              <Tooltip
                contentStyle={{ background: "hsl(240 14% 9%)", border: "1px solid hsl(240 10% 16%)", borderRadius: 12 }}
              />
              <Area type="monotone" dataKey="messageCount" stroke="hsl(154 78% 51%)" fill="url(#msg7d)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Активность за 24 часа</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={analytics24h}>
              <defs>
                <linearGradient id="msg24h" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(190 85% 55%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(190 85% 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 16%)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleTimeString("ru-RU", { hour: "2-digit" })}
                stroke="hsl(240 6% 60%)"
                fontSize={12}
              />
              <YAxis stroke="hsl(240 6% 60%)" fontSize={12} />
              <Tooltip
                contentStyle={{ background: "hsl(240 14% 9%)", border: "1px solid hsl(240 10% 16%)", borderRadius: 12 }}
              />
              <Area type="monotone" dataKey="onlineCount" stroke="hsl(190 85% 55%)" fill="url(#msg24h)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
