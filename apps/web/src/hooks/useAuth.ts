"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import { DashboardUser } from "@/types";

export function useAuth() {
  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);
  const user = useAppStore((s) => s.user);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<DashboardUser>("/auth/me")
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, setUser]);

  return { user, loading };
}
