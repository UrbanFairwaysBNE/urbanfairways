import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SGTDashboard } from "@/components/admin/sgt/SGTDashboard";
import { SGTPendingOnboarding } from "@/components/admin/sgt/SGTPendingOnboarding";
import { SGTLeagueMembers } from "@/components/admin/sgt/SGTLeagueMembers";
import { SGTTournaments } from "@/components/admin/sgt/SGTTournaments";
import { SGTWinners } from "@/components/admin/sgt/SGTWinners";
import { LeagueHighlights } from "@/components/admin/LeagueHighlights";
import { HIGHLIGHTS_ENABLED } from "@/config/features";

import { SGTSettingsDialog } from "@/components/admin/sgt/SGTSettingsDialog";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, UserPlus, Users, Calendar, Award, Video, Settings } from "lucide-react";

export default function AdminSGTManager() {
  const { isLoading } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Handle URL tab parameter (for email links)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["dashboard", "onboarding", "members", "tournaments", "winners", "highlights"].includes(tabParam)) {
      setActiveTab(tabParam);
      // Clean up URL after reading
      searchParams.delete("tab");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              SGT Manager
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage league members, tournaments, and track winners
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="SGT connection settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        <SGTSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />


        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="onboarding" className="gap-2">
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Pending Onboarding</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Members</span>
            </TabsTrigger>
            <TabsTrigger value="tournaments" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Tournaments</span>
            </TabsTrigger>
            <TabsTrigger value="winners" className="gap-2">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Winners</span>
            </TabsTrigger>
            {HIGHLIGHTS_ENABLED && (
              <TabsTrigger value="highlights" className="gap-2">
                <Video className="h-4 w-4" />
                <span className="hidden sm:inline">Highlights</span>
              </TabsTrigger>
            )}

          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <SGTDashboard />
          </TabsContent>

          <TabsContent value="onboarding" className="mt-6">
            <SGTPendingOnboarding />
          </TabsContent>

          <TabsContent value="members" className="mt-6">
            <SGTLeagueMembers />
          </TabsContent>

          <TabsContent value="tournaments" className="mt-6">
            <SGTTournaments />
          </TabsContent>

          <TabsContent value="winners" className="mt-6">
            <SGTWinners />
          </TabsContent>

          {HIGHLIGHTS_ENABLED && (
            <TabsContent value="highlights" className="mt-6">
              <LeagueHighlights />
            </TabsContent>
          )}

        </Tabs>
      </div>
    </AdminLayout>
  );
}
