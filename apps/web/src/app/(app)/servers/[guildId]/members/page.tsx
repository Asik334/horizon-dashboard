"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Search, Map } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { GuildMember, Paginated } from "@/types";
import { discordAvatarUrl } from "@/lib/utils";

export default function MembersPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!guildId) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search) params.set("search", search);
      api
        .get<Paginated<GuildMember> & { members: GuildMember[] }>(`/api/guilds/${guildId}/members?${params}`)
        .then((r) => {
          setMembers(r.members);
          setTotalPages(r.pagination.totalPages);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [guildId, search, page]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Members</h1>
        <Link
          href={`/servers/${guildId}/member-map`}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5"
        >
          <Map className="h-4 w-4" /> Activity Map
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Поиск участника..."
          className="w-full rounded-xl border border-border bg-white/5 py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <Link key={m.id} href={`/servers/${guildId}/members/${m.id}`}>
            <Card className="flex cursor-pointer items-center gap-3 transition-transform hover:-translate-y-0.5">
              <img
                src={discordAvatarUrl(m.discordId, m.avatar, 40)}
                className="h-10 w-10 rounded-full"
                alt={m.username}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.displayName ?? m.username}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.messageCount} msgs · {m._count?.warnings ?? 0} warnings
                </p>
              </div>
            </Card>
          </Link>
        ))}
        {members.length === 0 && (
          <Card className="col-span-full text-center text-muted-foreground">Участники не найдены</Card>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
