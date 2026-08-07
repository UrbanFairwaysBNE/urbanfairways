import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Users, Loader2, Trash2, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCorporate } from "@/hooks/useCorporate";
import { formatHours } from "@/hooks/usePackHours";

/**
 * Staff access for corporate accounts. Anyone listed here books against the
 * company's prepaid hours instead of paying — with an optional monthly cap.
 */
export function CorporateStaffCard() {
  const { account, staff, isOwner, isLoading, addStaff, removeStaff, setCap } = useCorporate();
  const [email, setEmail] = useState("");
  const [cap, setCapInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading || !account || !isOwner) return null;

  const handleAdd = async () => {
    setIsAdding(true);
    try {
      const parsedCap = cap.trim() === "" ? null : Number(cap);
      if (parsedCap !== null && (!Number.isFinite(parsedCap) || parsedCap <= 0)) {
        throw new Error("Monthly cap must be a number greater than zero");
      }
      await addStaff(email, parsedCap);
      toast.success("Staff member added");
      setEmail("");
      setCapInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add that staff member");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeStaff(id);
      toast.success("Access removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove access");
    }
  };

  const handleCapChange = async (id: string, value: string) => {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    try {
      await setCap(id, parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the cap");
    }
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>Staff</CardTitle>
                <CardDescription>
                  {staff.length === 0
                    ? "Give your team access to the company hours"
                    : `${staff.length} staff member${staff.length === 1 ? "" : "s"} with access`}
                </CardDescription>
              </div>
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="staff-email">Add a staff member</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="staff-email"
                  type="email"
                  placeholder="name@company.com.au"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isAdding}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && email.trim()) handleAdd();
                  }}
                />
                <Input
                  className="sm:w-40"
                  type="number"
                  min={1}
                  step={0.5}
                  placeholder="Cap (hrs/mo)"
                  value={cap}
                  onChange={(e) => setCapInput(e.target.value)}
                  disabled={isAdding}
                />
                <Button onClick={handleAdd} disabled={isAdding || !email.trim()}>
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" /> Add
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                They just need to create a normal account with this email — access switches on
                automatically. Leave the cap blank for unlimited.
              </p>
            </div>

            {staff.length > 0 && (
              <div className="space-y-2">
                {staff.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.user_id ? (
                          <>
                            {formatHours(s.hoursThisMonth ?? 0)} hrs used this month
                            {s.monthly_hour_cap
                              ? ` of ${formatHours(Number(s.monthly_hour_cap))}`
                              : ""}
                          </>
                        ) : (
                          "Waiting for them to create an account"
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!s.user_id && <Badge variant="secondary">Pending</Badge>}
                      <Input
                        className="w-24 h-9"
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="No cap"
                        defaultValue={s.monthly_hour_cap ?? ""}
                        onBlur={(e) => handleCapChange(s.id, e.target.value)}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {s.email}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              They'll no longer be able to book using the company hours. Sessions
                              they've already booked are unaffected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemove(s.id)}>
                              Remove access
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
