import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
  delay?: number;
}

export function StatCard({
  label,
  value,
  subValue,
  icon,
  trend,
  className,
  delay = 0
}: StatCardProps) {
  return (
    <div
      className={cn("stat-card animate-slide-up", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-anton text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {icon && (
          <div className="text-brand-accent">
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-4xl font-display text-primary">
          {value}
        </span>
        {trend && (
          <span className={cn(
            "text-sm font-inter font-medium mb-1",
            trend === "up" && "text-green-600",
            trend === "down" && "text-destructive",
            trend === "neutral" && "text-muted-foreground"
          )}>
            {trend === "up" && "↑"}
            {trend === "down" && "↓"}
            {trend === "neutral" && "→"}
          </span>
        )}
      </div>
      {subValue && (
        <span className="text-sm font-inter text-muted-foreground mt-1 block">
          {subValue}
        </span>
      )}
    </div>
  );
}