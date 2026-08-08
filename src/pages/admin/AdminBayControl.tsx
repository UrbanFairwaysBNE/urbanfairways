import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Power, 
  PowerOff, 
  User, 
  Clock, 
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { BayControllerLogs } from "@/components/admin/BayControllerLogs";

interface Bay {
  id: string;
  bay_number: number;
  name: string;
  is_active: boolean;
}

interface BayDevice {
  bay_id: string;
  is_online: boolean;
  last_seen: string | null;
  app_version: string | null;
}

interface Booking {
  id: string;
  bay_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  status: string;
  profiles?: {
    first_name: string;
    last_name: string;
  };
}

interface BayStatus {
  bay: Bay;
  device: BayDevice | null;
  currentBooking: Booking | null;
  nextBooking: Booking | null;
  plugsOn: boolean;
  isManualMode: boolean;
}

// Always have 7 bays to display
const DEFAULT_BAYS: Bay[] = [1, 2, 3, 4, 5, 6, 7].map((num) => ({
  id: `bay-${num}`,
  bay_number: num,
  name: `Bay ${num}`,
  is_active: true,
}));

export default function AdminBayControl() {
  const { isLoading: authLoading, isAdmin } = useAdminAuth();
  const [bayStatuses, setBayStatuses] = useState<BayStatus[]>(
    // Initialize with default bays immediately
    DEFAULT_BAYS.map((bay) => ({
      bay,
      device: null,
      currentBooking: null,
      nextBooking: null,
      plugsOn: false,
      isManualMode: false,
    }))
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBayStatuses = async () => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");

    // Fetch bays - need real bay IDs to match bookings
    let displayBays: Bay[] = [];
    try {
      const { data: bays, error } = await supabase
        .from("bays")
        .select("*")
        .order("bay_number");
      
      console.log("Fetched bays:", bays, "Error:", error);
      
      if (bays && bays.length > 0) {
        displayBays = bays;
      }
    } catch (e) {
      console.error("Error fetching bays:", e);
    }

    // If no bays from DB, use defaults for display only (statuses won't match)
    if (displayBays.length === 0) {
      displayBays = DEFAULT_BAYS;
      console.warn("Using default bays - bookings won't match");
    }

    // Fetch bay devices with control_mode - continue even if this fails
    let devices: (BayDevice & { control_mode?: string })[] = [];
    try {
      const { data } = await supabase.from("bay_devices").select("*, control_mode");
      devices = data || [];
    } catch (e) {
      console.error("Error fetching devices:", e);
    }

    // Fetch today's bookings - continue even if this fails
    let bookings: any[] = [];
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          bay_id,
          booking_date,
          start_time,
          end_time,
          duration_hours,
          status,
          user_id
        `)
        .eq("booking_date", today)
        .eq("status", "confirmed")
        .order("start_time");
      
      console.log("Fetched bookings for", today, ":", data, "Error:", error);
      
      if (data && data.length > 0) {
        // Fetch profiles separately for these bookings
        const userIds = [...new Set(data.map((b: any) => b.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", userIds);
        
        // Create a map of user_id to profile
        const profileMap: Record<string, { first_name: string; last_name: string }> = {};
        if (profiles) {
          profiles.forEach((p: any) => {
            profileMap[p.user_id] = { first_name: p.first_name, last_name: p.last_name };
          });
        }
        
        // Attach profiles to bookings
        bookings = data.map((b: any) => ({
          ...b,
          profiles: profileMap[b.user_id] || null
        }));
      }
    } catch (e) {
      console.error("Error fetching bookings:", e);
    }

    console.log("Display bays:", displayBays.map(b => ({ id: b.id, num: b.bay_number })));
    console.log("Bookings bay_ids:", bookings.map(b => b.bay_id));

    // Build bay statuses - always create all 6
    const statuses: BayStatus[] = displayBays.map((bay) => {
      const device = devices.find((d) => d.bay_id === bay.id) || null;
      const bayBookings = bookings.filter((b) => b.bay_id === bay.id);

      // Find current booking (now is between start and end)
      const currentBooking = bayBookings.find((b) => {
        const startTime = parseISO(`${b.booking_date}T${b.start_time}`);
        const endTime = parseISO(`${b.booking_date}T${b.end_time}`);
        return isAfter(now, startTime) && isBefore(now, endTime);
      }) || null;

      // Find next booking (starts after now)
      const nextBooking = bayBookings.find((b) => {
        const startTime = parseISO(`${b.booking_date}T${b.start_time}`);
        return isAfter(startTime, now);
      }) || null;

      // Determine if plugs should be on (simplified - actual state from device)
      const plugsOn = !!currentBooking;

      // Get control_mode from device, default to auto
      const deviceWithMode = device as (BayDevice & { control_mode?: string }) | null;
      const isManualMode = deviceWithMode?.control_mode === 'manual';

      return {
        bay,
        device,
        currentBooking: currentBooking ? {
          ...currentBooking,
          profiles: currentBooking.profiles as unknown as { first_name: string; last_name: string }
        } : null,
        nextBooking: nextBooking ? {
          ...nextBooking,
          profiles: nextBooking.profiles as unknown as { first_name: string; last_name: string }
        } : null,
        plugsOn,
        isManualMode,
      };
    });

    setBayStatuses(statuses);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (!authLoading && isAdmin) {
      fetchBayStatuses();
      
      // Set up real-time subscription - this is the PRIMARY data source
      const channel = supabase
        .channel("admin-bay-control")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings" },
          () => fetchBayStatuses()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bay_devices" },
          () => fetchBayStatuses()
        )
        .subscribe((status) => {
          // Only use polling as fallback when realtime disconnects
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[AdminBayControl] Realtime disconnected, falling back to polling');
          }
        });

      // Reduced polling interval (2 minutes) - realtime handles most updates
      // This is just a fallback for edge cases
      const interval = setInterval(fetchBayStatuses, 120000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
      };
    }
  }, [authLoading, isAdmin]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchBayStatuses();
  };

  const toggleBayPower = async (bayNumber: number, turnOn: boolean) => {
    try {
      // Insert command into bay_commands table for bay controller to pick up
      const { error } = await supabase
        .from("bay_commands")
        .insert({
          bay_number: bayNumber,
          command: turnOn ? "on" : "off",
          status: "pending"
        });

      if (error) {
        console.error("Error sending bay command:", error);
        toast.error(`Failed to send command to Bay ${bayNumber}`);
        return;
      }

      toast.success(`Command sent: Bay ${bayNumber} plugs ${turnOn ? "ON" : "OFF"}`);
    } catch (err) {
      console.error("Error sending bay command:", err);
      toast.error(`Failed to send command to Bay ${bayNumber}`);
    }
  };

  const toggleBayMode = async (bayNumber: number, setToManual: boolean) => {
    try {
      // Get bay_id for this bay number
      const status = bayStatuses.find(s => s.bay.bay_number === bayNumber);
      const bayId = status?.bay.id;
      
      if (!bayId) {
        // Try to get bay_id from database
        const { data: bayData } = await supabase
          .from("bays")
          .select("id")
          .eq("bay_number", bayNumber)
          .maybeSingle();
        
        if (!bayData?.id) {
          toast.error(`Bay ${bayNumber} not found`);
          return;
        }
        
        // Upsert bay_device with control_mode
        const { error } = await supabase
          .from("bay_devices")
          .upsert({
            bay_id: bayData.id,
            control_mode: setToManual ? 'manual' : 'auto',
            is_online: false,
            updated_at: new Date().toISOString()
          }, { onConflict: 'bay_id' });
        
        if (error) {
          console.error("Error updating bay mode:", error);
          toast.error(`Failed to update mode for Bay ${bayNumber}`);
          return;
        }
      } else {
        // Update existing device record by bay_id (the correct field)
        const { error } = await supabase
          .from("bay_devices")
          .update({ 
            control_mode: setToManual ? 'manual' : 'auto',
            updated_at: new Date().toISOString()
          })
          .eq("bay_id", bayId);
        
        if (error) {
          // If no rows updated, create the device record
          const { error: upsertError } = await supabase
            .from("bay_devices")
            .upsert({
              bay_id: bayId,
              control_mode: setToManual ? 'manual' : 'auto',
              is_online: false,
              updated_at: new Date().toISOString()
            }, { onConflict: 'bay_id' });
          
          if (upsertError) {
            console.error("Error updating bay mode:", upsertError);
            toast.error(`Failed to update mode for Bay ${bayNumber}`);
            return;
          }
        }
      }

      // Update local state to reflect the change immediately
      setBayStatuses(prev => prev.map(s => 
        s.bay.bay_number === bayNumber 
          ? { ...s, isManualMode: setToManual }
          : s
      ));

      // Also insert a bay_command so the bay controller picks it up reliably
      // (bay_commands uses INSERT realtime + polling fallback, more reliable than UPDATE events)
      const { error: cmdError } = await supabase
        .from("bay_commands")
        .insert({
          bay_number: bayNumber,
          command: setToManual ? 'manual' : 'auto',
          status: 'pending',
          created_by: (await supabase.auth.getUser()).data.user?.id || null,
        });
      
      if (cmdError) {
        console.warn("Failed to insert mode command (bay_devices already updated):", cmdError);
      }

      toast.success(`Bay ${bayNumber} switched to ${setToManual ? "MANUAL" : "AUTO"} mode`);
    } catch (err) {
      console.error("Error updating bay mode:", err);
      toast.error(`Failed to update mode for Bay ${bayNumber}`);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  if (authLoading || isLoading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-display uppercase">Bay Control</h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display uppercase">Bay Control</h1>
            <p className="text-xs text-muted-foreground mt-1">Auto-refreshes every 30 seconds • Real-time updates enabled</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Bay Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bayStatuses.map((status) => (
            <Card 
              key={status.bay.id} 
              className={`relative overflow-hidden ${
                status.currentBooking 
                  ? "border-primary/50 bg-primary/5" 
                  : "border-border"
              }`}
            >
              <CardContent className="p-4">
                {/* Bay Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Bay {status.bay.bay_number}</h3>
                  
                  {/* Power Controls - only enabled in Manual mode */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${status.isManualMode ? "text-green-600 hover:bg-green-500/10" : "text-muted-foreground"}`}
                      onClick={() => toggleBayPower(status.bay.bay_number, true)}
                      disabled={!status.isManualMode}
                      title={status.isManualMode ? "Turn ON" : "Switch to Manual mode first"}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${status.isManualMode ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground"}`}
                      onClick={() => toggleBayPower(status.bay.bay_number, false)}
                      disabled={!status.isManualMode}
                      title={status.isManualMode ? "Turn OFF" : "Switch to Manual mode first"}
                    >
                      <PowerOff className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Current Booking Status */}
                <div className="space-y-3">
                  {status.currentBooking ? (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <div className="p-2 rounded-full bg-primary/20">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {status.currentBooking.profiles?.first_name} {status.currentBooking.profiles?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(status.currentBooking.start_time)} - {formatTime(status.currentBooking.end_time)}
                        </p>
                      </div>
                      <Badge className="bg-primary text-primary-foreground shrink-0">
                        Active
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                      <div className="p-2 rounded-full bg-muted">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">No active booking</p>
                    </div>
                  )}

                  {/* Next Booking */}
                  {status.nextBooking && !status.currentBooking && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        Next: {formatTime(status.nextBooking.start_time)} - {status.nextBooking.profiles?.first_name} {status.nextBooking.profiles?.last_name}
                      </span>
                    </div>
                  )}

                  {/* Mode Toggle */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">Control Mode</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${!status.isManualMode ? "text-green-600" : "text-muted-foreground"}`}>
                        Auto
                      </span>
                      <Switch
                        checked={status.isManualMode}
                        onCheckedChange={(checked) => toggleBayMode(status.bay.bay_number, checked)}
                        className="data-[state=checked]:bg-orange-500"
                      />
                      <span className={`text-xs font-medium ${status.isManualMode ? "text-orange-600" : "text-muted-foreground"}`}>
                        Manual
                      </span>
                    </div>
                  </div>

                  {/* Plug Status Indicator */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">Plug Status</span>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${status.plugsOn ? "bg-green-500" : "bg-muted-foreground"}`} />
                      <span className={`text-xs font-medium ${status.plugsOn ? "text-green-600" : "text-muted-foreground"}`}>
                        {status.plugsOn ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bay Controller Logs Section */}
        <div className="mt-8">
          <BayControllerLogs />
        </div>

      </div>
    </AdminLayout>
  );
}