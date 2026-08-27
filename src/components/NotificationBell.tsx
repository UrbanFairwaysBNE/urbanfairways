import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  source_type?: string;
  source_id?: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(["common"]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;

  useEffect(() => {
    if (user) {
      fetchAnnouncements();
      fetchReadAnnouncements();
    }
  }, [user]);

  const fetchAnnouncements = async () => {
    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, content, created_at, source_type, source_id")
      .eq("is_active", true)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setAnnouncements(data);
    }
  };

  const fetchReadAnnouncements = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("user_id", user.id);

    if (!error && data) {
      setReadIds(new Set(data.map((r) => r.announcement_id)));
    }
  };

  const markAsRead = async (announcementId: string) => {
    if (!user || readIds.has(announcementId)) return;

    const { error } = await supabase.from("announcement_reads").insert({
      user_id: user.id,
      announcement_id: announcementId,
    });

    if (!error) {
      setReadIds((prev) => new Set([...prev, announcementId]));
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    const unreadAnnouncements = announcements.filter((a) => !readIds.has(a.id));
    
    for (const announcement of unreadAnnouncements) {
      await supabase.from("announcement_reads").insert({
        user_id: user.id,
        announcement_id: announcement.id,
      });
    }

    setReadIds(new Set(announcements.map((a) => a.id)));
  };

  const handleNotificationClick = (announcement: Announcement) => {
    markAsRead(announcement.id);
    setSelectedAnnouncement(announcement);
    setDialogOpen(true);
    setIsOpen(false);
  };

  const handleViewSource = () => {
    if (selectedAnnouncement?.source_type === 'clubhouse_post' && selectedAnnouncement.source_id) {
      navigate('/clubhouse');
      setDialogOpen(false);
    }
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-accent text-accent-foreground text-xs flex items-center justify-center font-medium">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="flex items-center justify-between p-4 border-b">
            <h4 className="font-semibold">{t("common:notifications")}</h4>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllAsRead}
              >
                {t("common:markAllRead")}
              </Button>
            )}
          </div>
          <ScrollArea className="h-[300px]">
            {announcements.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                {t("common:noNotifications")}
              </div>
            ) : (
              <div className="divide-y">
                {announcements.map((announcement) => {
                  const isRead = readIds.has(announcement.id);
                  return (
                    <div
                      key={announcement.id}
                      className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                        !isRead ? "bg-accent/5" : ""
                      }`}
                      onClick={() => handleNotificationClick(announcement)}
                    >
                      <div className="flex items-start gap-2">
                        {!isRead && (
                          <span className="h-2 w-2 mt-1.5 rounded-full bg-accent flex-shrink-0" />
                        )}
                        <div className={!isRead ? "" : "ml-4"}>
                          <p className="font-medium text-sm">{announcement.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {announcement.content}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {format(new Date(announcement.created_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedAnnouncement?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {selectedAnnouncement?.content?.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-brand-accent underline break-all">
                    {part}
                  </a>
                ) : part
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedAnnouncement && format(new Date(selectedAnnouncement.created_at), "MMMM d, yyyy 'at' h:mm a")}
            </p>
            {selectedAnnouncement?.source_type === 'clubhouse_post' && (
              <Button 
                onClick={handleViewSource}
                className="w-full"
              >
                View in Clubhouse
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}