import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Users, Search, Check, Loader2, AlertCircle } from "lucide-react";
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

interface OnboardedMember {
  id: string;
  user_id: number;
  user_name: string | null;
  email?: string;
  custom_hcp: number | null;
  tour_count: number;
}

export function SGTRegistrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [onboardingMemberId, setOnboardingMemberId] = useState<number | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editHandicapValue, setEditHandicapValue] = useState<string>("");
  const [handicapValue, setHandicapValue] = useState<string>("");

  // Fetch pending members (have sgt_user_id but NOT in any sgt_tour_members)
  const { data: pendingMembers, isLoading: pendingLoading } = useQuery({
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

      const onboardedUserIds = new Set((tourMembers || []).map(tm => tm.user_id));

      // Filter to only pending (not in any tour)
      const pending = profiles.filter(p => 
        p.sgt_user_id && !onboardedUserIds.has(p.sgt_user_id)
      );

      return pending as PendingMember[];
    },
  });

  // Fetch onboarded members (in at least one tour)
  const { data: onboardedMembers, isLoading: onboardedLoading } = useQuery({
    queryKey: ["sgt-onboarded-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tour_members")
        .select("id, user_id, user_name, custom_hcp, tour_id");

      if (error) throw error;

      // Get profile emails for matching
      const { data: profiles } = await supabase
        .from("profiles")
        .select("sgt_user_id, email")
        .not("sgt_user_id", "is", null);
      
      const sgtIdToEmail = new Map(
        (profiles || []).map(p => [p.sgt_user_id, p.email])
      );

      // Group by user_id and count tours
      const memberMap = new Map<number, OnboardedMember>();
      (data || []).forEach(tm => {
        if (!memberMap.has(tm.user_id)) {
          memberMap.set(tm.user_id, {
            id: tm.id,
            user_id: tm.user_id,
            user_name: tm.user_name,
            custom_hcp: tm.custom_hcp,
            tour_count: 1,
            email: sgtIdToEmail.get(tm.user_id),
          });
        } else {
          const existing = memberMap.get(tm.user_id)!;
          existing.tour_count++;
          // Keep the custom_hcp if set on any tour
          if (tm.custom_hcp !== null) {
            existing.custom_hcp = tm.custom_hcp;
          }
        }
      });

      return Array.from(memberMap.values()).sort((a, b) => 
        (a.user_name || "").localeCompare(b.user_name || "")
      );
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

      // Add member to all active tours with custom HCP
      for (const tour of activeTours) {
        const { error: insertError } = await supabase
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
          });

        if (insertError) {
          console.error(`Failed to add to tour ${tour.name}:`, insertError);
          throw insertError;
        }
      }

      // Trigger the auto-registration edge function to register for tournaments
      const { error: autoRegError } = await supabase.functions.invoke("sgt-auto-register", {
        body: { sgt_user_id: sgtUserId },
      });

      if (autoRegError) {
        console.error("Auto-registration failed:", autoRegError);
        // Don't throw - they're in tours now, tournaments can be added later
      }

      return { sgtUserId, tourCount: activeTours.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-pending-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-onboarded-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-tour-members"] });
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

  // Mutation to edit an onboarded member's handicap
  const editHcpMutation = useMutation({
    mutationFn: async ({ userId, customHcp }: { userId: number; customHcp: number }) => {
      console.log(`[SGT-EDIT-HCP] Updating HCP for user ${userId} to ${customHcp}`);

      // Update all tour_members records for this user
      const { error } = await supabase
        .from("sgt_tour_members")
        .update({ 
          custom_hcp: customHcp,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;
      return { userId, customHcp };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-onboarded-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-tour-members"] });
      setEditingMemberId(null);
      setEditHandicapValue("");
      toast({ 
        title: "Handicap updated",
        description: `Custom handicap set to ${data.customHcp.toFixed(1)}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update handicap",
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

  const handleEditHcp = (userId: number) => {
    const hcp = parseFloat(editHandicapValue);
    
    if (isNaN(hcp) || hcp < -36 || hcp > 36) {
      toast({
        title: "Invalid handicap",
        description: "Please enter a handicap between -36 and 36",
        variant: "destructive",
      });
      return;
    }

    editHcpMutation.mutate({ userId, customHcp: hcp });
  };

  const filteredPending = pendingMembers?.filter(m => {
    const query = searchQuery.toLowerCase();
    const fullName = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
    return fullName.includes(query) ||
      m.first_name?.toLowerCase().includes(query) ||
      m.last_name?.toLowerCase().includes(query) ||
      m.email?.toLowerCase().includes(query) ||
      m.display_name?.toLowerCase().includes(query);
  });

  const filteredOnboarded = onboardedMembers?.filter(m => {
    const query = searchQuery.toLowerCase();
    return m.user_name?.toLowerCase().includes(query) ||
      m.email?.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>How Onboarding Works</AlertTitle>
        <AlertDescription>
          New league members appear in "Pending" until you set their handicap. Once onboarded, 
          they're automatically added to all active tours and open tournaments. Future tournaments 
          will also auto-register them.
        </AlertDescription>
      </Alert>

      {/* Pending Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-amber-500" />
              <CardTitle>Pending Members</CardTitle>
            </div>
            {pendingMembers && pendingMembers.length > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                {pendingMembers.length} awaiting onboarding
              </Badge>
            )}
          </div>
          <CardDescription>
            These members have registered for the league but need a handicap before being added to tours
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPending && filteredPending.length > 0 ? (
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
                  {filteredPending.map((member) => (
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
                                  className="bg-green-600 hover:bg-green-700"
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

      {/* Onboarded Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Onboarded Members</CardTitle>
            </div>
            <Badge variant="secondary">
              {onboardedMembers?.length || 0} active
            </Badge>
          </div>
          <CardDescription>
            Members who are registered in tours and auto-enrolled in new tournaments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="max-w-xs">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {onboardedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOnboarded && filteredOnboarded.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead className="text-center">SGT ID</TableHead>
                    <TableHead className="text-center w-28">Custom HCP</TableHead>
                    <TableHead className="text-center">Tours</TableHead>
                    <TableHead className="text-center w-20">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOnboarded.map((member) => (
                    <TableRow key={member.user_id}>
                      <TableCell className="font-medium">
                        <div>
                          {member.user_name || `User ${member.user_id}`}
                          {member.email && (
                            <div className="text-xs text-muted-foreground">{member.email}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{member.user_id}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {editingMemberId === member.user_id ? (
                          <Input
                            type="number"
                            step="0.1"
                            min="-36"
                            max="36"
                            value={editHandicapValue}
                            onChange={(e) => setEditHandicapValue(e.target.value)}
                            className="w-20 mx-auto text-center"
                            placeholder="0.0"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditHcp(member.user_id);
                              if (e.key === "Escape") {
                                setEditingMemberId(null);
                                setEditHandicapValue("");
                              }
                            }}
                          />
                        ) : member.custom_hcp !== null ? (
                          <span className="font-semibold text-primary">
                            {member.custom_hcp.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">,</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{member.tour_count}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {editingMemberId === member.user_id ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => handleEditHcp(member.user_id)}
                                  disabled={editHcpMutation.isPending || !editHandicapValue}
                                >
                                  {editHcpMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Save Handicap</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingMemberId(member.user_id);
                              setEditHandicapValue(member.custom_hcp?.toString() || "");
                            }}
                          >
                            Edit
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
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No onboarded members yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
