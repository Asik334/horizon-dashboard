import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("glass rounded-2xl p-5", className)}>{children}</div>;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  accent?: "default" | "warning" | "destructive" | "success";
  /** Показывать тактический pulse-индикатор рядом со значением (для live-статусов). */
  pulse?: boolean;
}

const accentMap = {
  default: "text-accent bg-accent/10",
  warning: "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10",
  destructive: "text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10",
  success: "text-[hsl(var(--success))] bg-[hsl(var(--success))]/10",
};

export function StatCard({ label, value, icon: Icon, trend, accent = "default", pulse = false }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-3 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={cn("rounded-lg p-2", accentMap[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        {pulse && <span className="pulse-dot" aria-hidden="true" />}
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {trend && (
          <span className={cn("text-xs font-medium", trend.positive ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]")}>
            {trend.positive ? "+" : ""}
            {trend.value}%
          </span>
        )}
      </div>
    </Card>
  );
}
