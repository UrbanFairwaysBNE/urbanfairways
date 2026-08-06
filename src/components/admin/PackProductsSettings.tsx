import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2, Save, ChevronDown } from "lucide-react";
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

interface PackProduct {
  id: string;
  name: string;
  description: string | null;
  hours: number;
  price: number;
  validity_days: number;
  is_active: boolean;
  display_order: number;
}

const blankPack = (order: number): Omit<PackProduct, "id"> => ({
  name: "",
  description: "",
  hours: 5,
  price: 150,
  validity_days: 90,
  is_active: true,
  display_order: order,
});

/**
 * Prepaid hour packs (a separate wallet to the $ credit balance).
 * Every pack shares the same purchase → lot → FIFO consumption logic, so new
 * packs only need name, hours, price and validity.
 */
export const PackProductsSettings = () => {
  const [packs, setPacks] = useState<PackProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pack_products")
      .select("*")
      .order("display_order");
    if (error) {
      toast.error("Could not load packs");
    } else {
      setPacks((data ?? []) as PackProduct[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const update = (id: string, patch: Partial<PackProduct>) => {
    setPacks((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const save = async (pack: PackProduct) => {
    if (!pack.name.trim()) {
      toast.error("Give the pack a name");
      return;
    }
    if (pack.hours <= 0 || pack.price <= 0 || pack.validity_days <= 0) {
      toast.error("Hours, price and validity must all be greater than zero");
      return;
    }
    setSavingId(pack.id);
    const { error } = await supabase
      .from("pack_products")
      .update({
        name: pack.name.trim(),
        description: pack.description?.trim() || null,
        hours: pack.hours,
        price: pack.price,
        validity_days: pack.validity_days,
        is_active: pack.is_active,
        display_order: pack.display_order,
      })
      .eq("id", pack.id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Pack saved");
    }
  };

  const addPack = async () => {
    const { data, error } = await supabase
      .from("pack_products")
      .insert({ ...blankPack(packs.length), name: "New Pack" })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setPacks((prev) => [...prev, data as PackProduct]);
  };

  const removePack = async (id: string) => {
    const { error } = await supabase.from("pack_products").delete().eq("id", id);
    if (error) {
      // Packs already purchased are referenced by lots — deactivate instead
      toast.error("This pack has been purchased before, so it can only be deactivated");
      return;
    }
    setPacks((prev) => prev.filter((p) => p.id !== id));
    toast.success("Pack deleted");
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {packs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No packs yet. Add one to let customers prepay for sim time.
        </p>
      )}

      {packs.map((pack) => (
        <Collapsible key={pack.id}>
          <Card>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left [&[data-state=open]>svg]:rotate-180">
              <div className="min-w-0">
                <p className="font-medium truncate">{pack.name || "Untitled pack"}</p>
                <p className="text-xs text-muted-foreground">
                  {pack.hours}h · ${pack.price} · {pack.is_active ? "Active" : "Hidden"}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`name-${pack.id}`}>Pack name</Label>
                <Input
                  id={`name-${pack.id}`}
                  value={pack.name}
                  onChange={(e) => update(pack.id, { name: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 pt-8">
                <Switch
                  checked={pack.is_active}
                  onCheckedChange={(v) => update(pack.id, { is_active: v })}
                />
                <span className="text-sm text-muted-foreground">
                  {pack.is_active ? "Active" : "Hidden"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`desc-${pack.id}`}>Description</Label>
              <Input
                id={`desc-${pack.id}`}
                value={pack.description ?? ""}
                placeholder="Perfect for casual golfers"
                onChange={(e) => update(pack.id, { description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`hours-${pack.id}`}>Hours</Label>
                <Input
                  id={`hours-${pack.id}`}
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={pack.hours}
                  onChange={(e) => update(pack.id, { hours: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`price-${pack.id}`}>Price ($)</Label>
                <Input
                  id={`price-${pack.id}`}
                  type="number"
                  min={1}
                  step={1}
                  value={pack.price}
                  onChange={(e) => update(pack.id, { price: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`validity-${pack.id}`}>Valid (days)</Label>
                <Input
                  id={`validity-${pack.id}`}
                  type="number"
                  min={1}
                  step={1}
                  value={pack.validity_days}
                  onChange={(e) => update(pack.id, { validity_days: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`order-${pack.id}`}>Display order</Label>
                <Input
                  id={`order-${pack.id}`}
                  type="number"
                  value={pack.display_order}
                  onChange={(e) => update(pack.id, { display_order: Number(e.target.value) })}
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Effective rate:{" "}
              <span className="font-medium text-foreground">
                ${pack.hours > 0 ? (pack.price / pack.hours).toFixed(2) : "0.00"}/hr
              </span>{" "}
              · expires {pack.validity_days} days after purchase
            </p>

            <div className="flex gap-2">
              <Button onClick={() => save(pack)} disabled={savingId === pack.id}>
                <Save className="h-4 w-4 mr-2" />
                {savingId === pack.id ? "Saving..." : "Save"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{pack.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Customers who already bought this pack keep their hours. If it has ever
                      been purchased, deactivate it instead.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => removePack(pack.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}

      <Button variant="outline" onClick={addPack}>
        <Plus className="h-4 w-4 mr-2" />
        Add Pack
      </Button>
    </div>
  );
};
