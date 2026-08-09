import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  hasCustomControllerPassword,
  resetControllerPassword,
  setControllerPassword,
  verifyControllerPassword,
} from "@/lib/bay-controller-password";

export function ControllerPasswordSettings() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [isCustom, setIsCustom] = useState(hasCustomControllerPassword());

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords do not match");
      return;
    }
    setSaving(true);
    try {
      const ok = await verifyControllerPassword(current);
      if (!ok) {
        toast.error("Current password is incorrect");
        return;
      }
      await setControllerPassword(next);
      setIsCustom(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Controller password updated on this PC");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    resetControllerPassword();
    setIsCustom(false);
    toast.info("Reverted to the default controller password");
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Current password status</Label>
        <Badge variant={isCustom ? "default" : "secondary"}>
          {isCustom ? "Custom" : "Default"}
        </Badge>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cp-current">Current password</Label>
        <Input
          id="cp-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Enter current password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cp-new">New password</Label>
        <Input
          id="cp-new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="At least 6 characters"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cp-confirm">Confirm new password</Label>
        <Input
          id="cp-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter new password"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !current || !next || !confirm}>
          {saving ? "Saving..." : "Update password"}
        </Button>
        {isCustom && (
          <Button type="button" variant="outline" onClick={handleReset}>
            Reset to default
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        This password unlocks the controller, kiosk mode and quitting the app. It is
        stored on this bay PC only — change it on each bay you want it applied to.
      </p>
    </form>
  );
}
