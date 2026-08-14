"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { GuildMember } from "@/types";
import { discordAvatarUrl } from "@/lib/utils";

const WIDTH = 720;
const HEIGHT = 560;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };

export default function MemberMapPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [selected, setSelected] = useState<GuildMember | null>(null);

  useEffect(() => {
    if (!guildId) return;
    api
      .get<{ members: GuildMember[] }>(
        `/api/guilds/${guildId}/members?pageSize=60&sortBy=messageCount&sortDir=desc`
      )
      .then((r) => setMembers(r.members))
      .catch(() => {});
  }, [guildId]);

  const points = useMemo(() => {
    if (members.length === 0) return [];
    const maxMsg = Math.max(...members.map((m) => m.messageCount), 1);
    const maxRadius = Math.min(WIDTH, HEIGHT) / 2 - 50;

    return members.map((m, i) => {
      const angle = (i / members.length) * Math.PI * 2;
      // менее активные — дальше от центра; более активные — ближе
      const activityRatio = m.messageCount / maxMsg;
      const radius = maxRadius * (1 - activityRatio * 0.75) + 40;
      const size = 10 + activityRatio * 22;
      return {
        member: m,
        x: CENTER.x + Math.cos(angle) * radius,
        y: CENTER.y + Math.sin(angle) * radius,
        size,
        activityRatio,
      };
    });
  }, [members]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Member Activity Map</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Центр — сервер, вокруг — участники. Чем ближе и крупнее точка, тем выше активность.
        </p>
      </div>

      <Card className="relative overflow-hidden">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full">
          {/* фоновые концентрические кольца активности */}
          {[1, 0.66, 0.33].map((f) => (
            <circle
              key={f}
              cx={CENTER.x}
              cy={CENTER.y}
              r={(Math.min(WIDTH, HEIGHT) / 2 - 50) * f + 40}
              fill="none"
              stroke="hsl(240 10% 16%)"
              strokeDasharray="4 6"
            />
          ))}

          {points.map((p) => (
            <line
              key={p.member.id}
              x1={CENTER.x}
              y1={CENTER.y}
              x2={p.x}
              y2={p.y}
              stroke="hsl(255 85% 65%)"
              strokeOpacity={0.08 + p.activityRatio * 0.15}
            />
          ))}

          {/* центр — сервер */}
          <circle cx={CENTER.x} cy={CENTER.y} r={26} fill="hsl(255 85% 65%)" fillOpacity={0.25} />
          <circle cx={CENTER.x} cy={CENTER.y} r={14} fill="hsl(255 85% 65%)" />

          {points.map((p) => (
            <g
              key={p.member.id}
              onClick={() => setSelected(p.member)}
              className="cursor-pointer"
              opacity={selected && selected.id !== p.member.id ? 0.4 : 1}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={p.size}
                fill="hsl(280 85% 65%)"
                fillOpacity={0.15 + p.activityRatio * 0.35}
                stroke="hsl(280 85% 65%)"
                strokeWidth={1}
              />
            </g>
          ))}
        </svg>
      </Card>

      {selected && (
        <Card className="flex items-center gap-4">
          <img
            src={discordAvatarUrl(selected.discordId, selected.avatar, 56)}
            className="h-14 w-14 rounded-full"
            alt={selected.username}
          />
          <div>
            <p className="font-medium">{selected.displayName ?? selected.username}</p>
            <p className="text-sm text-muted-foreground">{selected.messageCount} сообщений</p>
          </div>
        </Card>
      )}
    </div>
  );
}
