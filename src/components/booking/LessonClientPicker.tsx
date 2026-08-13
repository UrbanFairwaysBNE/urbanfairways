import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, X, UserRound } from "lucide-react";

export interface LessonClient {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface LessonClientPickerProps {
  value: LessonClient | null;
  onChange: (client: LessonClient | null) => void;
}

export function clientName(c: LessonClient) {
  return `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "Client";
}

/**
 * Coach-facing search for the customer a lesson is being booked for.
 * Results come from the coach-only `search-lesson-clients` function.
 */
export default function LessonClientPicker({ value, onChange }: LessonClientPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LessonClient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      const { data, error: fnError } = await supabase.functions.invoke("search-lesson-clients", {
        body: { query: term },
      });
      if (cancelled) return;
      if (fnError) {
        setError("Could not search customers. Please try again.");
        setResults([]);
      } else {
        setResults((data?.clients ?? []) as LessonClient[]);
      }
      setIsSearching(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, value]);

  if (value) {
    return (
      <div className="space-y-2">
        <Label>Lesson client</Label>
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3 min-w-0">
              <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{clientName(value)}</p>
                {value.email && (
                  <p className="text-xs text-muted-foreground truncate">{value.email}</p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Clear client">
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="lesson-client-search">Lesson client</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id="lesson-client-search"
          className="pl-9"
          placeholder="Search by name or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {query.trim().length >= 2 && !isSearching && results.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">
          No matching customer. The client needs an account before you can book their lesson.
        </p>
      )}

      {results.length > 0 && (
        <div className="max-h-56 overflow-y-auto border rounded-md">
          {results.map((c) => (
            <button
              key={c.user_id}
              type="button"
              onClick={() => {
                onChange(c);
                setQuery("");
                setResults([]);
              }}
              className="w-full p-2 text-left text-sm hover:bg-muted/50 border-b last:border-b-0"
            >
              <span className="font-medium">{clientName(c)}</span>
              {c.email && <span className="block text-xs text-muted-foreground">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
