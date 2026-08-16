"use client";

import { Suspense } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { discordLoginUrl } from "@/lib/api";
import { useSearchParams } from "next/navigation";

const errorMessages: Record<string, string> = {
  invalid_state: "Сессия авторизации истекла, попробуйте снова.",
  oauth_failed: "Не удалось войти через Discord. Попробуйте ещё раз.",
};

function LoginCard() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass relative w-full max-w-sm rounded-2xl p-8 text-center"
    >
      <Image
        src="/logo.png"
        alt="Horizon Project"
        width={56}
        height={56}
        className="mx-auto mb-4 rounded-2xl"
        priority
      />
      <h1 className="font-display text-xl font-bold uppercase tracking-wide">
        Horizon <span className="gradient-text">Project</span>
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Панель управления вашими Discord-серверами
      </p>

      {error && (
        <div className="mt-4 rounded-xl border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]">
          {errorMessages[error] ?? "Произошла ошибка входа."}
        </div>
      )}

      <a
        href={discordLoginUrl()}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 font-medium text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
          <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.045-.32 13.579.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127c-.598.35-1.22.645-1.873.892a.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028Z" />
        </svg>
        Войти через Discord
      </a>

      <p className="mt-4 text-xs text-muted-foreground">
        Вы увидите только те сервера, на которых у вас есть права администратора.
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,hsl(154_78%_20%/0.35),transparent_60%)]" />
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
