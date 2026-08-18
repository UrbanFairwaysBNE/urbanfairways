import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Search, Calendar, Plus, MoreHorizontal, Pencil, XCircle, BarChart3, Sparkles, ScrollText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { TournamentFormDialog } from "./TournamentFormDialog";
import { TournamentStatsDialog } from "./TournamentStatsDialog";
import { TournamentCommentaryDialog } from "./TournamentCommentaryDialog";
import { TournamentScorecardsDialog } from "./TournamentScorecardsDialog";

export function SGTTournaments() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tourFilter, setTourFilter] = useState("all");
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<any>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [tournamentToClose, setTournamentToClose] = useState<any>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [statsTournament, setStatsTournament] = useState<any>(null);
  const [commentaryDialogOpen, setCommentaryDialogOpen] = useState(false);
  const [commentaryTournament, setCommentaryTournament] = useState<any>(null);
  const [scorecardsDialogOpen, setScorecardsDialogOpen] = useState(false);
  const [scorecardsTournament, setScorecardsTournament] = useState<any>(null);
  const queryClient = useQueryClient();

  // Fetch tournaments
  const { data: tournaments, isLoading } = useQuery({
    queryKey: ["sgt-tournaments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tournaments")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch tours for filter and form
  const { data: tours } = useQuery({
    queryKey: ["sgt-tours-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tours")
        .select("tour_id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filteredTournaments = tournaments?.filter((tournament) => {
    const matchesSearch =
      tournament.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tournament.course_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    
    const matchesStatus =
      statusFilter === "all" || tournament.status === statusFilter;
    
    const matchesTour =
      tourFilter === "all" || tournament.tour_id.toString() === tourFilter;

    return matchesSearch && matchesStatus && matchesTour;
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "Completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "Active":
      case "In Progress":
        return <Badge variant="default" className="bg-blue-600">In Progress</Badge>;
      case "Upcoming":
        return <Badge variant="secondary">Upcoming</Badge>;
      default:
        return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  };

  const handleCreateTournament = () => {
    setSelectedTournament(null);
    setFormDialogOpen(true);
  };

  const handleEditTournament = (tournament: any) => {
    setSelectedTournament(tournament);
    setFormDialogOpen(true);
  };

  const handleCloseTournament = async () => {
    if (!tournamentToClose) return;
    
    setIsClosing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sgt-member-management", {
        body: {
          action: "close-tournament",
          tournamentId: tournamentToClose.tournament_id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.success === false) {
        throw new Error(data.feedback || "SGT rejected the close request");
      }

      toast({
        title: "Tournament closed",
        description: `"${tournamentToClose.name}" has been closed successfully.`,
      });

      queryClient.invalidateQueries({ queryKey: ["sgt-tournaments"] });
    } catch (error) {
      console.error("Close tournament error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to close tournament",
        variant: "destructive",
      });
    } finally {
      setIsClosing(false);
      setCloseDialogOpen(false);
      setTournamentToClose(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Tournaments</h2>
        <Button onClick={handleCreateTournament}>
          <Plus className="h-4 w-4 mr-2" />
          Create Tournament
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tournaments or courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Upcoming">Upcoming</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tourFilter} onValueChange={setTourFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tour" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tours</SelectItem>
            {tours?.map((tour) => (
              <SelectItem key={tour.tour_id} value={tour.tour_id.toString()}>
                {tour.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tournaments Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredTournaments && filteredTournaments.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tournament</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTournaments.map((tournament) => (
                  <TableRow key={tournament.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{tournament.name}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {tournament.tournament_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tournament.course_name || "-"}
                    </TableCell>
                    <TableCell>
                      {tournament.start_date
                        ? format(new Date(tournament.start_date), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {tournament.end_date
                        ? format(new Date(tournament.end_date), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(tournament.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-background">
                          <DropdownMenuItem
                            onClick={() => {
                              setStatsTournament(tournament);
                              setStatsDialogOpen(true);
                            }}
                          >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            View Stats
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setScorecardsTournament(tournament);
                              setScorecardsDialogOpen(true);
                            }}
                          >
                            <ScrollText className="h-4 w-4 mr-2" />
                            Scorecards
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setCommentaryTournament(tournament);
                              setCommentaryDialogOpen(true);
                            }}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            AI Commentary
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditTournament(tournament)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {tournament.status !== "Completed" && (
                            <DropdownMenuItem
                              onClick={() => {
                                setTournamentToClose(tournament);
                                setCloseDialogOpen(true);
                              }}
                              className="text-destructive"
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Close Tournament
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No tournaments found</p>
          </CardContent>
        </Card>
      )}

      {/* Tournament Form Dialog */}
      <TournamentFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        tournament={selectedTournament}
        tours={tours || []}
        defaultTourId={tourFilter !== "all" ? parseInt(tourFilter) : undefined}
      />

      {/* Tournament Stats Dialog */}
      <TournamentStatsDialog
        open={statsDialogOpen}
        onOpenChange={setStatsDialogOpen}
        tournament={statsTournament}
      />

      {/* Scorecards Dialog */}
      <TournamentScorecardsDialog
        open={scorecardsDialogOpen}
        onOpenChange={setScorecardsDialogOpen}
        tournament={scorecardsTournament}
      />

      {/* AI Commentary Dialog */}
      <TournamentCommentaryDialog
        open={commentaryDialogOpen}
        onOpenChange={setCommentaryDialogOpen}
        tournament={commentaryTournament}
      />



      {/* Close Tournament Confirmation Dialog */}
      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Tournament</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close "{tournamentToClose?.name}"? This will finalize the tournament and no more scores can be submitted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseTournament}
              disabled={isClosing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClosing ? "Closing..." : "Close Tournament"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
