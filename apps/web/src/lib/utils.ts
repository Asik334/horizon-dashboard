import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function discordAvatarUrl(discordId: string, avatar: string | null, size = 64) {
  if (!avatar) {
    // дефолтный аватар Discord по индексу
    const idx = Number(BigInt(discordId) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=${size}`;
}

export function guildIconUrl(guildId: string, icon: string | null, size = 128) {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=${size}`;
}
