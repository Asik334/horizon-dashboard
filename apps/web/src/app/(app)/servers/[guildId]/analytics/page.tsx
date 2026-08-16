"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { AnalyticsPoint } from "@/types";
import { cn } from "@/lib/utils";

const periods = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
] as const;

export default function AnalyticsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [period, setPeriod] = useState<(typeof periods)[number]["value"]>("7d");
  const [data, setData] = useState<AnalyticsPoint[]>([]);

  useEffect(() => {
    if (!guildId) return;
    api
      .get<{ data: AnalyticsPoint[] }>(`/api/guilds/${guildId}/analytics?period=${period}`)
      .then((r) => setData(r.data))
      .catch(() => {});
  }, [guildId, period]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <div className="flex gap-1 rounded-xl border border-border p-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium",
                period === p.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-white/5"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {[
        { title: "Member Growth", key: "memberCount", color: "hsl(154 78% 51%)" },
        { title: "Message Activity", key: "messageCount", color: "hsl(190 85% 55%)" },
        { title: "Online Users", key: "onlineCount", color: "hsl(142 70% 45%)" },
        { title: "Voice Activity (min)", key: "voiceMinutes", color: "hsl(38 92% 55%)" },
        { title: "New Members", key: "newMembers", color: "hsl(200 85% 60%)" },
        { title: "Moderation Actions", key: "moderationActs", color: "hsl(0 72% 58%)" },
      ].map((chart) => (
        <Card key={chart.key}>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">{chart.title}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data}>
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
              <Line type="monotone" dataKey={chart.key} stroke={chart.color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      ))}
    </div>
  );
}
