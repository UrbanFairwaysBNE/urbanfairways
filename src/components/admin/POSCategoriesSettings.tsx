import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface POSCategory {
  id: string;
  name: string;
  display_order: number;
}

/**
 * Manage the category tiles shown on the POS home screen.
 * Categories are independent of products, so an empty category can exist
 * (and can be deleted) without touching the product list.
 */
export function POSCategoriesSettings() {
  const [categories, setCategories] = useState<POSCategory[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toDelete, setToDelete] = useState<POSCategory | null>(null);

  const fetchAll = async () => {
    const [{ data: cats, error }, { data: prods }] = await Promise.all([
      supabase.from("pos_categories").select("*").order("display_order"),
      supabase.from("pos_products").select("family"),
    ]);

    if (error) {
      console.error("Error loading POS categories:", error);
      toast.error("Couldn't load POS categories");
    } else {
      setCategories(cats || []);
    }

    const tally: Record<string, number> = {};
    (prods || []).forEach((p) => {
      if (p.family) tally[p.family] = (tally[p.family] || 0) + 1;
    });
    setCounts(tally);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const addCategory = async () => {
    const name = newName.trim();
    if (!name) return;

    setIsSaving(true);
    const nextOrder = categories.length
      ? Math.max(...categories.map((c) => c.display_order)) + 1
      : 0;

    const { error } = await supabase
      .from("pos_categories")
      .insert({ name, display_order: nextOrder });

    if (error) {
      toast.error(
        error.code === "23505" ? "That category already exists" : "Couldn't add category",
      );
    } else {
      toast.success(`"${name}" added`);
      setNewName("");
      fetchAll();
    }
    setIsSaving(false);
  };

  const deleteCategory = async (category: POSCategory) => {
    const { error } = await supabase.from("pos_categories").delete().eq("id", category.id);

    if (error) {
      toast.error("Couldn't delete category");
      return;
    }

    // Products keep their family label; unassign so they don't vanish from the POS.
    if (counts[category.name]) {
      await supabase
        .from("pos_products")
        .update({ family: null })
        .eq("family", category.name);
    }

    toast.success(`"${category.name}" deleted`);
    setToDelete(null);
    fetchAll();
  };

  const move = async (category: POSCategory, direction: "up" | "down") => {
    const index = categories.findIndex((c) => c.id === category.id);
    const target = categories[direction === "up" ? index - 1 : index + 1];
    if (!target) return;

    setCategories((prev) => {
      const next = [...prev];
      next[index] = target;
      next[direction === "up" ? index - 1 : index + 1] = category;
      return next;
    });

    await Promise.all([
      supabase
        .from("pos_categories")
        .update({ display_order: target.display_order })
        .eq("id", category.id),
      supabase
        .from("pos_categories")
        .update({ display_order: category.display_order })
        .eq("id", target.id),
    ]);
    fetchAll();
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="space-y-2">
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No categories — the POS will only show Custom Amount.
              </p>
            )}
            {categories.map((category, index) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-2 p-3 border rounded-lg"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={index === 0}
                      onClick={() => move(category, "up")}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={index === categories.length - 1}
                      onClick={() => move(category, "down")}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="font-medium text-sm">{category.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {counts[category.name] || 0} items
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setToDelete(category)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            placeholder="New category name"
          />
          <Button onClick={addCategory} disabled={isSaving || !newName.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          The Golf category shows live 1hr Peak and 1hr Off-Peak bay hire buttons priced from
          your Casual rates — increase the quantity for extra hours.
        </p>
      </CardContent>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && counts[toDelete.name]
                ? `${counts[toDelete.name]} product(s) use this category. They won't be deleted, but they'll become uncategorised and disappear from the POS until you give them a new category.`
                : "This category is empty, so nothing else changes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && deleteCategory(toDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
