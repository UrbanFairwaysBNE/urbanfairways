import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  AlertTriangle, 
  XCircle,
  Info,
  Download,
  Filter,
  Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, subDays } from "date-fns";

interface LogEntry {
  id: string;
  bay_number: number;
  event_type: string;
  event_level: string;
  message: string;
  details: Record<string, unknown> | null;
  booking_id: string | null;
  app_version: string | null;
  created_at: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  app_launch: 'App Launch',
  app_close_scheduled: 'App Close (Scheduled)',
  app_close_manual: 'App Close (Manual)',
  app_close_unexpected: 'App Close (Unexpected)',
  plug_on: 'Plug ON',
  plug_off: 'Plug OFF',
  booking_active: 'Booking Active',
  booking_ended: 'Booking Ended',
  window_fixed: 'Window Fixed',
  notification_shown: 'Notification',
  manual_override_start: 'Manual Override',
  manual_override_end: 'Auto Resumed',
  error: 'Error',
  controller_start: 'Controller Start',
  connection_lost: 'Connection Lost',
  connection_restored: 'Connection Restored',
};

export function BayControllerLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedBay, setSelectedBay] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedEventType, setSelectedEventType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(true);

  const fetchLogs = async () => {
    setIsRefreshing(true);
    try {
      let query = supabase
        .from("bay_controller_logs")
        .select("*")
        .gte("created_at", subDays(new Date(), 7).toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

      if (selectedBay !== "all") {
        query = query.eq("bay_number", parseInt(selectedBay));
      }
      if (selectedLevel !== "all") {
        query = query.eq("event_level", selectedLevel);
      }
      if (selectedEventType !== "all") {
        query = query.eq("event_type", selectedEventType);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching logs:", error);
        return;
      }

      setLogs((data || []) as LogEntry[]);
    } catch (err) {
      console.error("Error fetching logs:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // Subscribe to real-time log updates
    const channel = supabase
      .channel("bay-controller-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bay_controller_logs" },
        (payload) => {
          setLogs((prev) => [payload.new as LogEntry, ...prev].slice(0, 500));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedBay, selectedLevel, selectedEventType]);

  const filteredLogs = logs.filter((log) => {
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(search) ||
        log.event_type.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getLevelBadgeVariant = (level: string) => {
    switch (level) {
      case 'error':
        return 'destructive' as const;
      case 'warning':
        return 'secondary' as const;
      default:
        return 'outline' as const;
    }
  };

  const exportToCSV = () => {
    const headers = ["Timestamp", "Bay", "Level", "Event Type", "Message"];
    const rows = filteredLogs.map((log) => [
      format(parseISO(log.created_at), "yyyy-MM-dd HH:mm:ss"),
      `Bay ${log.bay_number}`,
      log.event_level,
      log.event_type,
      `"${log.message.replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bay-logs-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uniqueEventTypes = [...new Set(logs.map((l) => l.event_type))];

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 cursor-pointer hover:opacity-80">
                <FileText className="h-5 w-5" />
                <CardTitle className="text-lg">Bay Controller Logs</CardTitle>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {filteredLogs.length} logs
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Select value={selectedBay} onValueChange={setSelectedBay}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Bay" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bays</SelectItem>
                  {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      Bay {num}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedEventType} onValueChange={setSelectedEventType}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  {uniqueEventTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {EVENT_TYPE_LABELS[type] || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[200px]"
              />

              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
            </div>

            {/* Logs List */}
            <ScrollArea className="h-[400px] rounded-md border">
              {isLoading ? (
                <div className="p-4 text-center text-muted-foreground">
                  Loading logs...
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No logs found
                </div>
              ) : (
                <div className="divide-y">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-3 hover:bg-muted/50 ${
                        log.event_level === 'error' ? 'bg-destructive/5' : 
                        log.event_level === 'warning' ? 'bg-yellow-500/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getLevelIcon(log.event_level)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              Bay {log.bay_number}
                            </Badge>
                            <Badge variant={getLevelBadgeVariant(log.event_level)} className="text-xs">
                              {EVENT_TYPE_LABELS[log.event_type] || log.event_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(parseISO(log.created_at), "MMM d, h:mm:ss a")}
                            </span>
                          </div>
                          <p className="text-sm mt-1">{log.message}</p>
                          
                          {/* Expandable details */}
                          {log.details && Object.keys(log.details).length > 0 && (
                            <button
                              onClick={() => toggleLogExpanded(log.id)}
                              className="text-xs text-primary mt-1 flex items-center gap-1 hover:underline"
                            >
                              {expandedLogs.has(log.id) ? (
                                <>
                                  <ChevronUp className="h-3 w-3" /> Hide details
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3 w-3" /> Show details
                                </>
                              )}
                            </button>
                          )}
                          
                          {expandedLogs.has(log.id) && log.details && (
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                        
                        {log.app_version && (
                          <span className="text-xs text-muted-foreground">
                            v{log.app_version}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
