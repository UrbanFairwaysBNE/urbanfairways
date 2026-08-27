import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

export const FRONTLINE_SECTORS = [
  "Emergency Services",
  "Defence",
  "Healthcare",
] as const;

interface Props {
  open: boolean;
  tierName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (sector: string) => void;
}

/**
 * Shown before subscribing to a tier flagged `requires_verification`.
 * The customer picks their sector; we email the venue for a follow-up check only —
 * access is granted immediately with no approval step.
 */
export function FrontlineVerificationDialog({ open, tierName, onOpenChange, onConfirm }: Props) {
  const { t } = useTranslation(["membership", "common"]);
  const [sector, setSector] = useState<string>("");

  const sectorLabels: Record<string, string> = {
    "Emergency Services": t("membership:sectorEmergencyServices"),
    "Defence": t("membership:sectorDefence"),
    "Healthcare": t("membership:sectorHealthcare"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-accent" />
          </div>
          <DialogTitle className="text-center font-display text-xl">
            {t("membership:eligibilityTitle", { tierName })}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("membership:eligibilityDesc")}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={sector} onValueChange={setSector} className="space-y-2 py-2">
          {FRONTLINE_SECTORS.map((option) => (
            <Label
              key={option}
              htmlFor={`sector-${option}`}
              className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
            >
              <RadioGroupItem value={option} id={`sector-${option}`} />
              <span className="text-sm font-medium">{sectorLabels[option] ?? option}</span>
            </Label>
          ))}
        </RadioGroup>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t("common:cancel")}
          </Button>
          <Button
            disabled={!sector}
            onClick={() => onConfirm(sector)}
            className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {t("common:continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
