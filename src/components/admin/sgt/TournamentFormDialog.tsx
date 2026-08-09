import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CourseSelector } from "./CourseSelector";

// Enums based on SGT API
const POINTS_OPTIONS = ["Tour", "WGC", "Major", "Playoff", "TourChp"] as const;
const GAMEPLAY_OPTIONS = ["Normal", "Scramble", "AltShot", "Shamble", "BetterBall", "TeamStroke"] as const;
const HOLES_OPTIONS = ["18", "Front9", "Back9", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17"] as const;
const GIMMES_OPTIONS = [0, 2, 4, 5, 6, 8, 10, 99] as const;
const PUTTING_MODE_OPTIONS = ["Optimistic", "Casual", "Hard"] as const;
const PUTTING_MODE_LABELS: Record<typeof PUTTING_MODE_OPTIONS[number], string> = {
  "Optimistic": "Default",
  "Casual": "Casual", 
  "Hard": "Hard",
};
const GREEN_FIRMNESS_OPTIONS = ["Soft", "Normal", "Hard", "Firm", "Links"] as const;
const FAIRWAY_FIRMNESS_OPTIONS = ["Soft", "Normal", "Hard", "Firm", "Links"] as const;
const TEES_OPTIONS = ["Black", "Blue", "White", "Yellow", "Green", "Red", "Junior", "Par3"] as const;
const PINS_OPTIONS = ["Thursday", "Friday", "Saturday", "Sunday"] as const;
const WIND_OPTIONS = ["No Wind", "Calm", "Breezy", "Gusty"] as const;

const roundConfigSchema = z.object({
  courseId: z.number().optional(),
  greenSpeed: z.number().min(8).max(13).default(11),
  greenFirmness: z.enum(GREEN_FIRMNESS_OPTIONS).default("Normal"),
  fairwayFirmness: z.enum(FAIRWAY_FIRMNESS_OPTIONS).default("Normal"),
  tees: z.enum(TEES_OPTIONS).default("White"),
  pins: z.enum(PINS_OPTIONS).default("Thursday"),
  wind: z.enum(WIND_OPTIONS).default("Calm"),
});

const tournamentFormSchema = z.object({
  tournamentname: z.string().min(1, "Tournament name is required").max(50, "Max 50 characters"),
  tourId: z.string().min(1, "Tour is required"),
  // Tournament settings
  numberrounds: z.number().min(1).max(4).default(1),
  registrationon: z.boolean().default(true),
  statson: z.boolean().default(true), // Include in WGR & tour statistics
  clubcombo: z.boolean().default(true),
  points: z.enum(POINTS_OPTIONS).default("Tour"),
  gameplay: z.enum(GAMEPLAY_OPTIONS).default("Normal"),
  stableford: z.boolean().default(false),
  numberholes: z.enum(HOLES_OPTIONS).default("18"),
  gimmes: z.number().default(5),
  puttingmode: z.enum(PUTTING_MODE_OPTIONS).default("Optimistic"),
  head2head: z.boolean().default(false),
  hideleaderboard: z.boolean().default(false),
  skins: z.boolean().default(false),
  mulligans: z.boolean().default(false),
  attempts: z.boolean().default(false),
  // Dates
  regstartdate: z.date().optional(),
  regenddate: z.date().optional(),
  startdate: z.date({ required_error: "Start date is required" }),
  enddate: z.date({ required_error: "End date is required" }),
  // Round configs
  round1: roundConfigSchema,
  round2: roundConfigSchema.optional(),
  round3: roundConfigSchema.optional(),
  round4: roundConfigSchema.optional(),
});

type TournamentFormValues = z.infer<typeof tournamentFormSchema>;

interface Tour {
  tour_id: number;
  name: string;
}

interface TournamentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament?: {
    tournament_id: number;
    name: string;
    course_name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    tour_id: number;
  };
  tours: Tour[];
  defaultTourId?: number;
}

function RoundConfigSection({ 
  roundNumber, 
  form, 
  courseName 
}: { 
  roundNumber: 1 | 2 | 3 | 4; 
  form: any; 
  courseName?: string | null;
}) {
  const fieldPrefix = `round${roundNumber}` as const;
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(courseName || null);

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <h4 className="font-medium text-sm">Round {roundNumber} Configuration</h4>
      
      <FormField
        control={form.control}
        name={`${fieldPrefix}.courseId`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Course</FormLabel>
            <FormControl>
              <CourseSelector
                value={field.value}
                onSelect={(courseId, course) => {
                  field.onChange(courseId);
                  setSelectedCourseName(course.name);
                }}
                placeholder="Search and select a course..."
              />
            </FormControl>
            {selectedCourseName && !field.value && (
              <p className="text-sm text-muted-foreground">Current: {selectedCourseName}</p>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name={`${fieldPrefix}.greenSpeed`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Green Speed</FormLabel>
              <Select 
                onValueChange={(v) => field.onChange(parseInt(v))} 
                value={field.value?.toString()}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Speed" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {[8, 9, 10, 11, 12, 13].map(speed => (
                    <SelectItem key={speed} value={speed.toString()}>{speed}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`${fieldPrefix}.greenFirmness`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Green Firmness</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {GREEN_FIRMNESS_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`${fieldPrefix}.fairwayFirmness`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fairway Firmness</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {FAIRWAY_FIRMNESS_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`${fieldPrefix}.tees`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tees</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TEES_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`${fieldPrefix}.pins`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pin Positions</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PINS_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`${fieldPrefix}.wind`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Wind</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {WIND_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

export function TournamentFormDialog({
  open,
  onOpenChange,
  tournament,
  tours,
  defaultTourId,
}: TournamentFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const queryClient = useQueryClient();
  const isEditing = !!tournament;

  const defaultRoundConfig = {
    courseId: undefined,
    greenSpeed: 11,
    greenFirmness: "Normal" as const,
    fairwayFirmness: "Normal" as const,
    tees: "White" as const,
    pins: "Thursday" as const,
    wind: "Calm" as const,
  };

  const form = useForm<TournamentFormValues>({
    resolver: zodResolver(tournamentFormSchema),
    defaultValues: {
      tournamentname: "",
      tourId: defaultTourId?.toString() || "",
      numberrounds: 1,
      registrationon: true,
      statson: true,
      clubcombo: true,
      points: "Tour",
      gameplay: "Normal",
      stableford: false,
      numberholes: "18",
      gimmes: 5,
      puttingmode: "Optimistic",
      head2head: false,
      hideleaderboard: false,
      skins: false,
      mulligans: false,
      attempts: false,
      startdate: undefined,
      enddate: undefined,
      round1: defaultRoundConfig,
      round2: { ...defaultRoundConfig, pins: "Friday" as const },
      round3: { ...defaultRoundConfig, pins: "Saturday" as const },
      round4: { ...defaultRoundConfig, pins: "Sunday" as const },
    },
  });

  const watchNumberRounds = form.watch("numberrounds");

  // Fetch tournament details from SGT API when editing
  const fetchTournamentDetails = async (tournamentId: number) => {
    setIsLoadingDetails(true);
    try {
      const { data, error } = await supabase.functions.invoke("sgt-member-management", {
        body: { action: "get-tournament-details", tournamentId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      console.log("Tournament details from SGT:", data);
      return data;
    } catch (error) {
      console.error("Failed to fetch tournament details:", error);
      toast({
        title: "Warning",
        description: "Could not load all tournament settings. Some fields may use default values.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Helper to parse round config from SGT API response
  const parseRoundConfig = (details: any, roundNum: number) => {
    const courseId = details?.[`course${roundNum}Id`] || details?.[`course${roundNum}_id`];
    return {
      courseId: courseId ? parseInt(courseId) : undefined,
      greenSpeed: parseInt(details?.[`green${roundNum}speed`] || details?.[`green${roundNum}_speed`]) || 11,
      greenFirmness: (details?.[`green${roundNum}firmness`] || details?.[`green${roundNum}_firmness`] || "Normal") as typeof GREEN_FIRMNESS_OPTIONS[number],
      fairwayFirmness: (details?.[`fairway${roundNum}firmness`] || details?.[`fairway${roundNum}_firmness`] || "Normal") as typeof FAIRWAY_FIRMNESS_OPTIONS[number],
      tees: (details?.[`tees${roundNum}`] || "White") as typeof TEES_OPTIONS[number],
      pins: (details?.[`pins${roundNum}`] || ["Thursday", "Friday", "Saturday", "Sunday"][roundNum - 1]) as typeof PINS_OPTIONS[number],
      wind: (details?.[`wind${roundNum}`] || "Calm") as typeof WIND_OPTIONS[number],
    };
  };

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (tournament) {
        // First set basic values from local data, then fetch full details from SGT
        form.reset({
          tournamentname: tournament.name,
          tourId: tournament.tour_id.toString(),
          numberrounds: 1,
          statson: true,
          clubcombo: true,
          points: "Tour",
          gameplay: "Normal",
          stableford: false,
          numberholes: "18",
          gimmes: 5,
          puttingmode: "Optimistic",
          head2head: false,
          hideleaderboard: false,
          skins: false,
          mulligans: false,
          attempts: false,
          startdate: tournament.start_date ? new Date(tournament.start_date) : undefined,
          enddate: tournament.end_date ? new Date(tournament.end_date) : undefined,
          round1: defaultRoundConfig,
        });

        // Fetch full details from SGT API
        fetchTournamentDetails(tournament.tournament_id).then((details) => {
          if (details) {
            const numRounds = parseInt(details.numberrounds || details.number_rounds) || 1;
            
            form.reset({
              tournamentname: details.tournamentname || details.tournament_name || tournament.name,
              tourId: (details.tourId || details.tour_id || tournament.tour_id).toString(),
              numberrounds: numRounds,
              statson: details.statson === 1 || details.stats_on === 1 || details.statson === "1",
              clubcombo: details.clubcombo === 1 || details.club_combo === 1 || details.clubcombo === "1",
              points: (details.points || "Tour") as typeof POINTS_OPTIONS[number],
              gameplay: (details.gameplay || "Normal") as typeof GAMEPLAY_OPTIONS[number],
              stableford: details.stableford === 1 || details.stableford === "1",
              numberholes: (details.numberholes || details.number_holes || "18") as typeof HOLES_OPTIONS[number],
              gimmes: parseInt(details.gimmes) || 0,
              puttingmode: (details.puttingmode || details.putting_mode || "Optimistic") as typeof PUTTING_MODE_OPTIONS[number],
              head2head: details.head2head === 1 || details.head2head === "1",
              hideleaderboard: details.hideleaderboard === 1 || details.hide_leaderboard === 1 || details.hideleaderboard === "1",
              skins: details.skins === 1 || details.skins === "1",
              mulligans: details.mulligans === 1 || details.mulligans === "1",
              attempts: details.attempts === 1 || details.attempts === "1",
              startdate: details.startdate || details.start_date 
                ? new Date(details.startdate || details.start_date) 
                : tournament.start_date ? new Date(tournament.start_date) : undefined,
              enddate: details.enddate || details.end_date 
                ? new Date(details.enddate || details.end_date) 
                : tournament.end_date ? new Date(tournament.end_date) : undefined,
              regstartdate: details.regstartdate || details.reg_start_date 
                ? new Date(details.regstartdate || details.reg_start_date) 
                : undefined,
              regenddate: details.regenddate || details.reg_end_date 
                ? new Date(details.regenddate || details.reg_end_date) 
                : undefined,
              round1: parseRoundConfig(details, 1),
              round2: numRounds >= 2 ? parseRoundConfig(details, 2) : { ...defaultRoundConfig, pins: "Friday" as const },
              round3: numRounds >= 3 ? parseRoundConfig(details, 3) : { ...defaultRoundConfig, pins: "Saturday" as const },
              round4: numRounds >= 4 ? parseRoundConfig(details, 4) : { ...defaultRoundConfig, pins: "Sunday" as const },
            });

            // Open advanced settings if there are non-default values
            if (details.gameplay !== "Normal" || details.points !== "Tour" || 
                details.stableford || details.hideleaderboard || details.skins || 
                details.mulligans || details.attempts || details.gimmes > 0) {
              setShowAdvanced(true);
            }
          }
        });
      } else {
        form.reset({
          tournamentname: "",
          tourId: defaultTourId?.toString() || "",
          numberrounds: 1,
          registrationon: true,
          statson: true,
          clubcombo: true,
          points: "Tour",
          gameplay: "Normal",
          stableford: false,
          numberholes: "18",
          gimmes: 0,
          puttingmode: "Optimistic",
          head2head: false,
          hideleaderboard: false,
          skins: false,
          mulligans: false,
          attempts: false,
          startdate: undefined,
          enddate: undefined,
          round1: defaultRoundConfig,
        });
      }
      setShowAdvanced(false);
    }
  }, [open, tournament, defaultTourId, form]);

  const onSubmit = async (values: TournamentFormValues) => {
    if (!values.round1.courseId) {
      toast({ title: "Error", description: "Round 1 course is required", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const body: Record<string, any> = {
        action: isEditing ? "edit-tournament" : "create-tournament",
        ...(isEditing ? { tournamentId: tournament.tournament_id } : {}),
        tournamentname: values.tournamentname,
        tourId: parseInt(values.tourId),
        // Tournament settings
        numberrounds: values.numberrounds,
        registrationon: values.registrationon ? 1 : 0,
        statson: values.statson ? 1 : 0, // Include in WGR & tour statistics
        clubcombo: values.clubcombo ? 1 : 0,
        points: values.points,
        gameplay: values.gameplay,
        stableford: values.stableford ? 1 : 0,
        numberholes: values.numberholes,
        gimmes: values.gimmes,
        puttingmode: values.puttingmode,
        head2head: values.head2head ? 1 : 0,
        hideleaderboard: values.hideleaderboard ? 1 : 0,
        skins: values.skins ? 1 : 0,
        mulligans: values.mulligans ? 1 : 0,
        attempts: values.attempts ? 1 : 0,
        // Dates
        regstartdate: values.regstartdate ? format(values.regstartdate, "yyyy-MM-dd") : format(values.startdate, "yyyy-MM-dd"),
        regenddate: values.regenddate ? format(values.regenddate, "yyyy-MM-dd") : format(values.enddate, "yyyy-MM-dd"),
        startdate: format(values.startdate, "yyyy-MM-dd"),
        enddate: format(values.enddate, "yyyy-MM-dd"),
        // Round 1
        course1select: values.round1.courseId,
        green1speed: values.round1.greenSpeed,
        green1firmness: values.round1.greenFirmness,
        fairway1firmness: values.round1.fairwayFirmness,
        tees1: values.round1.tees,
        pins1: values.round1.pins,
        wind1: values.round1.wind,
      };

      // Add additional rounds if configured
      if (values.numberrounds >= 2 && values.round2?.courseId) {
        body.course2select = values.round2.courseId;
        body.green2speed = values.round2.greenSpeed;
        body.green2firmness = values.round2.greenFirmness;
        body.fairway2firmness = values.round2.fairwayFirmness;
        body.tees2 = values.round2.tees;
        body.pins2 = values.round2.pins;
        body.wind2 = values.round2.wind;
      }

      if (values.numberrounds >= 3 && values.round3?.courseId) {
        body.course3select = values.round3.courseId;
        body.green3speed = values.round3.greenSpeed;
        body.green3firmness = values.round3.greenFirmness;
        body.fairway3firmness = values.round3.fairwayFirmness;
        body.tees3 = values.round3.tees;
        body.pins3 = values.round3.pins;
        body.wind3 = values.round3.wind;
      }

      if (values.numberrounds >= 4 && values.round4?.courseId) {
        body.course4select = values.round4.courseId;
        body.green4speed = values.round4.greenSpeed;
        body.green4firmness = values.round4.greenFirmness;
        body.fairway4firmness = values.round4.fairwayFirmness;
        body.tees4 = values.round4.tees;
        body.pins4 = values.round4.pins;
        body.wind4 = values.round4.wind;
      }

      const { data, error } = await supabase.functions.invoke("sgt-member-management", { body });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: isEditing ? "Tournament updated" : "Tournament created",
        description: data.feedback || `Tournament "${values.tournamentname}" has been ${isEditing ? "updated" : "created"} successfully.`,
      });

      queryClient.invalidateQueries({ queryKey: ["sgt-tournaments"] });
      onOpenChange(false);
    } catch (error) {
      console.error("Tournament form error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save tournament",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Tournament" : "Create Tournament"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the tournament details below. Settings are loaded from SGT."
              : "Fill in the details to create a new tournament with GSPro settings."}
          </DialogDescription>
        </DialogHeader>

        {isLoadingDetails ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading tournament settings from SGT...</p>
          </div>
        ) : (
        <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Basic Info */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="tournamentname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tournament Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter tournament name (max 50 chars)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="tourId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tour</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a tour" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tours.map((tour) => (
                              <SelectItem key={tour.tour_id} value={tour.tour_id.toString()}>
                                {tour.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="numberrounds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number of Rounds</FormLabel>
                        <Select 
                          onValueChange={(v) => field.onChange(parseInt(v))} 
                          value={field.value.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {[1, 2, 3, 4].map(n => (
                              <SelectItem key={n} value={n.toString()}>{n} Round{n > 1 ? 's' : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gimmes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gimmes (feet)</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {GIMMES_OPTIONS.map(opt => (
                              <SelectItem key={opt} value={opt.toString()}>
                                {opt === 0 ? "None" : opt === 99 ? "Auto-putt" : `${opt} ft`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startdate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "PPP") : "Pick a date"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                        <FormDescription className="text-xs">
                          Pick one day before your intended Brisbane start date. SGT's backend timezone shifts the displayed date forward by one day.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enddate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "PPP") : "Pick a date"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                        <FormDescription className="text-xs">
                          The same one-day offset applies, but auto-close runs Monday 6am Brisbane regardless of the date shown in SGT.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Round Configurations */}
              <div className="space-y-4">
                <h3 className="font-semibold">Round Configuration</h3>
                <RoundConfigSection roundNumber={1} form={form} courseName={tournament?.course_name} />
                
                {watchNumberRounds >= 2 && (
                  <RoundConfigSection roundNumber={2} form={form} />
                )}
                {watchNumberRounds >= 3 && (
                  <RoundConfigSection roundNumber={3} form={form} />
                )}
                {watchNumberRounds >= 4 && (
                  <RoundConfigSection roundNumber={4} form={form} />
                )}
              </div>

              <Separator />

              {/* Advanced Settings - Collapsible */}
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span>Advanced Settings</span>
                    {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  {/* Gameplay Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="gameplay"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gameplay</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {GAMEPLAY_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="points"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Points Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {POINTS_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="numberholes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Holes</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="18">18 Holes</SelectItem>
                              <SelectItem value="Front9">Front 9</SelectItem>
                              <SelectItem value="Back9">Back 9</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="puttingmode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Putting Difficulty</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PUTTING_MODE_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>{PUTTING_MODE_LABELS[opt]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Toggle Options */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="registrationon"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Registration Open</FormLabel>
                            <FormDescription className="text-xs">Allow members to register</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="statson"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Include in WGR & Stats</FormLabel>
                            <FormDescription className="text-xs">Count for HCP, standings & Club WGR</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="clubcombo"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Combo Handicap</FormLabel>
                            <FormDescription className="text-xs">Include in club combo</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />


                    <FormField
                      control={form.control}
                      name="stableford"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Stableford</FormLabel>
                            <FormDescription className="text-xs">Use stableford scoring</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="hideleaderboard"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Hide Leaderboard</FormLabel>
                            <FormDescription className="text-xs">Until tournament closes</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="skins"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Show Skins</FormLabel>
                            <FormDescription className="text-xs">On leaderboard</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="mulligans"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Mulligans</FormLabel>
                            <FormDescription className="text-xs">Allow mulligans</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="attempts"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Auto-Concede 10</FormLabel>
                            <FormDescription className="text-xs">After 10 strokes</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex justify-end gap-2 pt-4 sticky bottom-0 bg-background pb-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? isEditing ? "Updating..." : "Creating..."
                    : isEditing ? "Update Tournament" : "Create Tournament"}
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}