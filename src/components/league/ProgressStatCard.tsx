import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { X } from "lucide-react";

interface ProgressStatCardProps {
  value: string | number;
  label: string;
  subValue?: string;
  explanation: string;
  className?: string;
  valueClassName?: string;
  icon?: React.ReactNode;
  variant?: "default" | "compact";
}

export function ProgressStatCard({
  value,
  label,
  subValue,
  explanation,
  className = "",
  valueClassName = "text-foreground",
  icon,
  variant = "default",
}: ProgressStatCardProps) {
  const [open, setOpen] = useState(false);

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`rounded-xl p-4 text-center transition-all hover:scale-[1.02] hover:shadow-md cursor-pointer ${className}`}
        >
          <p className={`font-anton text-2xl ${valueClassName}`}>{value}</p>
          <p className="text-xs font-inter text-muted-foreground">{label}</p>
          {subValue && (
            <p className="text-xs font-inter text-brand-accent font-medium mt-1">{subValue}</p>
          )}
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {icon && icon}
                  <DialogTitle className="font-anton text-xl text-primary">
                    {label}
                  </DialogTitle>
                </div>
              </div>
              <DialogDescription className="font-inter text-base pt-3 text-muted-foreground">
                {explanation}
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted rounded-xl p-5 text-center">
              <p className={`font-anton text-5xl ${valueClassName}`}>{value}</p>
              {subValue && (
                <p className="text-sm font-inter text-muted-foreground mt-2">{subValue}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-xl p-4 text-left transition-all hover:shadow-md cursor-pointer flex items-center gap-4 ${className}`}
      >
        {icon}
        <div>
          <p className={`font-anton text-2xl ${valueClassName}`}>{value}</p>
          <p className="text-sm font-inter text-muted-foreground">{label}</p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {icon}
              <DialogTitle className="font-anton text-xl text-primary">
                {label}
              </DialogTitle>
            </div>
            <DialogDescription className="font-inter text-base pt-3 text-muted-foreground">
              {explanation}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-xl p-5 text-center">
            <p className={`font-anton text-5xl ${valueClassName}`}>{value}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}