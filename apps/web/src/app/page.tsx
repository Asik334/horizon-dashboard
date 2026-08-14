"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    api
      .get("/auth/me")
      .then(() => router.replace("/servers"))
      .catch((err) => {
        if (err instanceof ApiError) router.replace("/login");
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}
