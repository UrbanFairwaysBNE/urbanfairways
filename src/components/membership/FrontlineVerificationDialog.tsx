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
 * The customer picks their sector; we email the venue so it can be confirmed.
 */
export function FrontlineVerificationDialog({ open, tierName, onOpenChange, onConfirm }: Props) {
  const [sector, setSector] = useState<string>("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-accent" />
          </div>
          <DialogTitle className="text-center font-display text-xl">
            {tierName} Eligibility
          </DialogTitle>
          <DialogDescription className="text-center">
            This membership is for Emergency Services, Defence and Healthcare workers. Let us know
            which applies to you and we'll be in touch to confirm.
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
              <span className="text-sm font-medium">{option}</span>
            </Label>
          ))}
        </RadioGroup>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            disabled={!sector}
            onClick={() => onConfirm(sector)}
            className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
