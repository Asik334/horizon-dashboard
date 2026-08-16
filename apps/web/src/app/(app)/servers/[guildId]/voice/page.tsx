"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Mic } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { VoiceChannelState } from "@/types";

export default function VoicePage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [channels, setChannels] = useState<VoiceChannelState[]>([]);

  useEffect(() => {
    if (!guildId) return;
    const load = () =>
      api
        .get<{ channels: VoiceChannelState[] }>(`/api/guilds/${guildId}/voice`)
        .then((r) => setChannels(r.channels))
        .catch(() => {});
    load();
    const interval = setInterval(load, 10_000); // простой поллинг; можно заменить на WS-событие voice:update
    return () => clearInterval(interval);
  }, [guildId]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Voice Activity</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((c) => (
          <Card key={c.channelId} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`pulse-dot ${c.users > 0 ? "" : "pulse-dot-idle"}`} aria-hidden="true" />
              <div className="rounded-lg bg-accent/10 p-2 text-accent">
                <Mic className="h-4 w-4" />
              </div>
              <span className="font-medium">{c.channelName}</span>
            </div>
            <span className="font-mono text-sm text-muted-foreground">{c.users} users</span>
          </Card>
        ))}
        {channels.length === 0 && (
          <Card className="col-span-full text-center text-muted-foreground">
            Сейчас никто не находится в голосовых каналах
          </Card>
        )}
      </div>
    </div>
  );
}
