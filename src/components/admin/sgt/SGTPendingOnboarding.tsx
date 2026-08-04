import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/config/tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Check, Loader2, AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

interface PendingMember {
  user_id: string;
  sgt_user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export function SGTPendingOnboarding() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [onboardingMemberId, setOnboardingMemberId] = useState<number | null>(null);
  const [handicapValue, setHandicapValue] = useState<string>("");

  // Fetch pending members (have sgt_user_id but NOT in any sgt_tour_members)
  const { data: pendingMembers, isLoading } = useQuery({
    queryKey: ["sgt-pending-members"],
    queryFn: async () => {
      // Get all profiles with sgt_user_id
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, sgt_user_id, first_name, last_name, email, display_name, created_at")
        .not("sgt_user_id", "is", null)
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;
      if (!profiles || profiles.length === 0) return [];

      // Get all unique user_ids that are already in tour_members
      const { data: tourMembers, error: tourMembersError } = await supabase
        .from("sgt_tour_members")
        .select("user_id");

      if (tourMembersError) throw tourMembersError;

      // Get all unique player_ids that have played at least one scorecard.
      // Returning members (whose old tour_members row was removed when a tour
      // ended) shouldn't appear as "new", they already have a custom HCP
      // calculated from their history.
      const { data: scoredPlayers, error: scoredError } = await supabase
        .from("sgt_scorecards")
        .select("player_id")
        .not("player_id", "is", null);

      if (scoredError) throw scoredError;

      const onboardedUserIds = new Set((tourMembers || []).map(tm => tm.user_id));
      const playedUserIds = new Set((scoredPlayers || []).map(s => s.player_id));

      // Filter to only truly new pending (not in any tour AND no play history)
      const pending = profiles.filter(p =>
        p.sgt_user_id &&
        !onboardedUserIds.has(p.sgt_user_id) &&
        !playedUserIds.has(p.sgt_user_id)
      );

      return pending as PendingMember[];
    },
  });

  // Mutation to onboard a member (set HCP and trigger registration)
  const onboardMutation = useMutation({
    mutationFn: async ({ sgtUserId, customHcp }: { sgtUserId: number; customHcp: number }) => {
      console.log(`[SGT-ONBOARD] Onboarding member ${sgtUserId} with HCP ${customHcp}`);

      // Get all active tours
      const { data: activeTours, error: toursError } = await supabase
        .from("sgt_tours")
        .select("tour_id, name")
        .eq("active", 1);

      if (toursError) throw toursError;
      if (!activeTours || activeTours.length === 0) {
        throw new Error("No active tours found");
      }

      // Get member info from sgt_members
      const { data: memberInfo } = await supabase
        .from("sgt_members")
        .select("user_name")
        .eq("user_id", sgtUserId)
        .maybeSingle();

      // Add member to all active tours with custom HCP in parallel
      // onboarding_hcp is the locked starting handicap used for first 6 rounds
      const upsertResults = await Promise.all(
        activeTours.map((tour) =>
          supabase
            .from("sgt_tour_members")
            .upsert({
              user_id: sgtUserId,
              tour_id: tour.tour_id,
              user_name: memberInfo?.user_name || null,
              custom_hcp: customHcp,
              onboarding_hcp: customHcp,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "user_id,tour_id",
            })
            .then((res) => ({ tour, error: res.error }))
        )
      );

      const failed = upsertResults.find((r) => r.error);
      if (failed) {
        console.error(`Failed to add to tour ${failed.tour.name}:`, failed.error);
        throw failed.error;
      }

      // Fire-and-forget the auto-registration edge function, it can take a while
      // because it hits the external SGT API for every open tournament. No need
      // to block the admin UI on it.
      supabase.functions
        .invoke("sgt-auto-register", { body: { sgt_user_id: sgtUserId } })
        .then(({ error }) => {
          if (error) console.error("Auto-registration failed:", error);
        });

      return { sgtUserId, tourCount: activeTours.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-pending-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-league-members"] });
      setOnboardingMemberId(null);
      setHandicapValue("");
      toast({ 
        title: "Member onboarded successfully",
        description: `Added to ${data.tourCount} active tour(s) and registered for open tournaments.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to onboard member",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleOnboard = (sgtUserId: number) => {
    const hcp = parseFloat(handicapValue);
    
    if (isNaN(hcp) || hcp < -36 || hcp > 36) {
      toast({
        title: "Invalid handicap",
        description: "Please enter a handicap between -36 and 36",
        variant: "destructive",
      });
      return;
    }

    onboardMutation.mutate({ sgtUserId, customHcp: hcp });
  };

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>How Onboarding Works</AlertTitle>
        <AlertDescription>
          New league members appear here until you set their initial handicap. Once set,
          they're automatically added to all active tours and registered for open tournaments.
          Their onboarding handicap is locked for the first 6 rounds (~3 weeks), after which
          {`the ${tenant.venue_name} Custom HCP auto-recalculates weekly using the best 3 of their last 6 rounds.`}
        </AlertDescription>
      </Alert>

      {/* Pending Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-amber-500" />
              <CardTitle>Awaiting Handicap</CardTitle>
            </div>
            {pendingMembers && pendingMembers.length > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                {pendingMembers.length} pending
              </Badge>
            )}
          </div>
          <CardDescription>
            Set an initial handicap to activate these members in the league
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingMembers && pendingMembers.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">SGT ID</TableHead>
                    <TableHead className="text-center w-32">Handicap</TableHead>
                    <TableHead className="text-center w-24">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingMembers.map((member) => (
                    <TableRow key={member.sgt_user_id}>
                      <TableCell className="font-medium">
                        {member.display_name || `${member.first_name} ${member.last_name}`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.email}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{member.sgt_user_id}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {onboardingMemberId === member.sgt_user_id ? (
                          <Input
                            type="number"
                            step="0.1"
                            min="-36"
                            max="36"
                            value={handicapValue}
                            onChange={(e) => setHandicapValue(e.target.value)}
                            className="w-20 mx-auto text-center"
                            placeholder="0.0"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleOnboard(member.sgt_user_id);
                              if (e.key === "Escape") {
                                setOnboardingMemberId(null);
                                setHandicapValue("");
                              }
                            }}
                          />
                        ) : (
                          <span className="text-muted-foreground">,</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {onboardingMemberId === member.sgt_user_id ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleOnboard(member.sgt_user_id)}
                                  disabled={onboardMutation.isPending || !handicapValue}
                                >
                                  {onboardMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Confirm & Onboard</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setOnboardingMemberId(member.sgt_user_id);
                              setHandicapValue("");
                            }}
                          >
                            Set HCP
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No pending members</p>
              <p className="text-sm">All registered members have been onboarded</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
