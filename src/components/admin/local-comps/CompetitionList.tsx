import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calendar, DollarSign, Trophy, Trash2, MapPin, ChevronDown, ChevronUp, Settings2, Sparkles } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { CourseSelector } from "@/components/admin/sgt/CourseSelector";
import { HubHighlightsToggle } from "./HubHighlightsToggle";
import { CompActiveToggle } from "./CompActiveToggle";
import { CompCommentaryDialog } from "./CompCommentaryDialog";


const TEES_OPTIONS = ["Black", "Blue", "White", "Yellow", "Green", "Red", "Junior", "Par3"] as const;
const PINS_OPTIONS = ["Thursday", "Friday", "Saturday", "Sunday"] as const;
const WIND_OPTIONS = ["Calm", "Breezy", "Gusty"] as const;
const FIRMNESS_OPTIONS = ["Soft", "Normal", "Hard", "Firm", "Links"] as const;
const GREEN_SPEEDS = [8, 9, 10, 11, 12, 13];

export function CompetitionList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [recapComp, setRecapComp] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState("");

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [entryFee, setEntryFee] = useState("10");
  const [courseSetupOpen, setCourseSetupOpen] = useState(false);
  const [courseId, setCourseId] = useState<number | undefined>();
  const [courseName, setCourseName] = useState<string | null>(null);
  const [tees, setTees] = useState<string>("White");
  const [greenSpeed, setGreenSpeed] = useState<number>(11);
  const [greenFirmness, setGreenFirmness] = useState<string>("Normal");
  const [fairwayFirmness, setFairwayFirmness] = useState<string>("Normal");
  const [pins, setPins] = useState<string>("Thursday");
  const [wind, setWind] = useState<string>("Calm");

  const { data: competitions, isLoading } = useQuery({
    queryKey: ["local-competitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_competitions")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => {
    setName("");
    setDate("");
    setStartTime("");
    setEntryFee("10");
    setCourseSetupOpen(false);
    setCourseId(undefined);
    setCourseName(null);
    setTees("White");
    setGreenSpeed(11);
    setGreenFirmness("Normal");
    setFairwayFirmness("Normal");
    setPins("Thursday");
    setWind("Calm");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("local_competitions").insert({
        name,
        date,
        start_time: startTime || null,
        entry_fee: parseFloat(entryFee),
        course_id: courseId ?? null,
        course_name: courseName,
        tees,
        green_speed: greenSpeed,
        green_firmness: greenFirmness,
        fairway_firmness: fairwayFirmness,
        pins,
        wind,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-competitions"] });
      toast({ title: "Competition created", duration: 3000 });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // When marking completed, compute & persist positions first so the
      // Winner's Tax trigger has positions to act on.
      if (status === "completed") {
        const { data: teams, error: teamsErr } = await supabase
          .from("local_comp_teams")
          .select("id, gross_score, net_score")
          .eq("competition_id", id);
        if (teamsErr) throw teamsErr;

        const scored = (teams ?? []).filter(
          (t) => t.net_score !== null && t.net_score !== undefined
        );
        if (scored.length === 0) {
          throw new Error("Cannot mark completed: no team scores entered yet.");
        }

        const sorted = [...scored].sort((a: any, b: any) => {
          if (a.net_score === b.net_score) {
            return (a.gross_score ?? 999) - (b.gross_score ?? 999);
          }
          return a.net_score - b.net_score;
        });

        for (let i = 0; i < sorted.length; i++) {
          const { error: posErr } = await supabase
            .from("local_comp_teams")
            .update({ position: i + 1 })
            .eq("id", (sorted[i] as any).id);
          if (posErr) throw posErr;
        }
      }

      const { error } = await supabase
        .from("local_competitions")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["local-competitions"] });
      queryClient.invalidateQueries({ queryKey: ["local-hcp-adjustments"] });
      toast({
        title: vars.status === "completed" ? "Completed & handicaps adjusted" : "Status updated",
        duration: 3000,
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("local_comp_teams").delete().eq("competition_id", id);
      const { error } = await supabase.from("local_competitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-competitions"] });
      toast({ title: "Competition deleted", duration: 3000 });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "upcoming": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "active": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "completed": return "bg-muted text-muted-foreground border-muted";
      default: return "";
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <HubHighlightsToggle />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Competitions</h2>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Competition</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Competition</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wednesday Night Ambrose" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Entry Fee Per Team ($)</Label>
                <Input type="number" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} min="0" step="5" />
              </div>

              <Collapsible open={courseSetupOpen} onOpenChange={setCourseSetupOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" type="button" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Course Setup
                      {courseName && (
                        <Badge variant="secondary" className="ml-2 font-normal">
                          {courseName} • {tees}
                        </Badge>
                      )}
                    </span>
                    {courseSetupOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-4 p-4 border rounded-lg bg-muted/30">
                  <div>
                    <Label>Course</Label>
                    <CourseSelector
                      value={courseId}
                      onSelect={(id, course) => {
                        setCourseId(id);
                        setCourseName(course.name);
                      }}
                      placeholder="Search and select a course..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Tees</Label>
                      <Select value={tees} onValueChange={setTees}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TEES_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Green Speed (Stimp)</Label>
                      <Select value={greenSpeed.toString()} onValueChange={(v) => setGreenSpeed(parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GREEN_SPEEDS.map(s => <SelectItem key={s} value={s.toString()}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Green Firmness</Label>
                      <Select value={greenFirmness} onValueChange={setGreenFirmness}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIRMNESS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Fairway Firmness</Label>
                      <Select value={fairwayFirmness} onValueChange={setFairwayFirmness}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIRMNESS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Pin Positions</Label>
                      <Select value={pins} onValueChange={setPins}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PINS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Wind</Label>
                      <Select value={wind} onValueChange={setWind}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WIND_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={!name || !date || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Competition"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!competitions || competitions.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Trophy className="h-12 w-12 mb-3 opacity-40" />
            <p>No competitions yet. Create your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {competitions.map((comp: any) => (
            <Card key={comp.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{comp.name}</CardTitle>
                  <Badge variant="outline" className={statusColor(comp.status)}>
                    {comp.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 text-sm text-muted-foreground mb-2 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(comp.date + "T00:00:00"), "EEE dd MMM yyyy")}
                    {comp.start_time && ` • ${comp.start_time.slice(0, 5)}`}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4" />
                    ${comp.entry_fee} entry
                  </span>
                  <span>Format: 2-Man Ambrose</span>
                </div>
                {comp.course_name && (
                  <div className="mb-4 p-3 rounded-lg border bg-muted/30 space-y-2">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span>{comp.course_name}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <div><span className="opacity-70">Tees:</span> <span className="font-medium text-foreground">{comp.tees ?? ','}</span></div>
                      <div><span className="opacity-70">Pins:</span> <span className="font-medium text-foreground">{comp.pins ?? ','}</span></div>
                      <div><span className="opacity-70">Wind:</span> <span className="font-medium text-foreground">{comp.wind ?? ','}</span></div>
                      <div><span className="opacity-70">Green Speed:</span> <span className="font-medium text-foreground">Stimp {comp.green_speed ?? ','}</span></div>
                      <div><span className="opacity-70">Green Firmness:</span> <span className="font-medium text-foreground">{comp.green_firmness ?? ','}</span></div>
                      <div><span className="opacity-70">Fairway Firmness:</span> <span className="font-medium text-foreground">{comp.fairway_firmness ?? ','}</span></div>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  {comp.status === "upcoming" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: comp.id, status: "active" })}>
                      Start Competition
                    </Button>
                  )}
                  {comp.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: comp.id, status: "completed" })}>
                      Mark Completed
                    </Button>
                  )}
                  {comp.status !== "upcoming" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRecapComp({ id: comp.id, name: comp.name })}
                    >
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      AI Recap
                    </Button>
                  )}
                  {comp.status === "completed" && (
                    <Button size="sm" variant="ghost" onClick={() => updateStatusMutation.mutate({ id: comp.id, status: "active" })}>
                      Reopen
                    </Button>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete competition?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{comp.name}" and all registered teams. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(comp.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CompCommentaryDialog
        open={!!recapComp}
        onOpenChange={(o) => !o && setRecapComp(null)}
        competition={recapComp}
      />
    </div>

  );
}
