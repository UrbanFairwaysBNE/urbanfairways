import { useState, useEffect } from "react";
import { usePricing } from "@/hooks/usePricing";
import { format } from "date-fns";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  FileText,
  BarChart3,
  Plus,
  Eye,
  Mail,
  Users,
  Clock,
  MousePointer,
  Loader2,
  Search,
  Pencil,
  Zap,
  Star,
  MessageSquare,
  Frown,
  Meh,
  Smile,
  ClipboardList,
} from "lucide-react";
import { ReviewApprovals } from "@/components/admin/ReviewApprovals";
import { EmailPreviewFrame } from "@/components/admin/EmailPreviewFrame";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  recipient_count: number;
  sent_at: string | null;
  status: string;
  opens: number;
  clicks: number;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  html_content: string;
  category: string;
}

interface CustomerFilter {
  membership_tier?: string;
  booking_count?: string;
}

const ALL_CUSTOMERS_OPTION = { value: "all", label: "All Customers" };

const BOOKING_OPTIONS = [
  { value: "all", label: "Any Booking Count" },
  { value: "0", label: "0 Bookings" },
  { value: "1-5", label: "1-5 Bookings" },
  { value: "6-10", label: "6-10 Bookings" },
  { value: "10+", label: "10+ Bookings" },
];

const SEGMENT_OPTIONS = [
  { value: "all", label: "All Customers" },
  { value: "hub_launch_missed", label: "Hub Launch Missed (622)" },
  { value: "none", label: "No Segment Only" },
];

export default function AdminMarketing() {
  const { isLoading: authLoading, isAdmin } = useAdminAuth();
  const { pricing } = usePricing();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignHtml, setCampaignHtml] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [bookingFilter, setBookingFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [recipientCount, setRecipientCount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isCountingRecipients, setIsCountingRecipients] = useState(false);
  
  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  // Template editor state
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editHtml, setEditHtml] = useState("");
  
  // First session promo counter
  const [promoEligibleCount, setPromoEligibleCount] = useState<number | null>(null);
  const PROMO_THRESHOLD = 10;
  
  // First session promo success tracking
  const [promoStats, setPromoStats] = useState<{ sent: number; converted: number } | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchCampaigns();
      fetchTemplates();
      fetchPromoEligibleCount();
      fetchPromoSuccessRate();
    }
  }, [isAdmin]);

  const fetchPromoSuccessRate = async () => {
    try {
      // Get all users who received the promo
      const { data: promoRecipients, error: recipientsError } = await supabase
        .from("profiles")
        .select("user_id")
        .not("first_session_promo_sent", "is", null);
      
      if (recipientsError) {
        console.error("Error fetching promo recipients:", recipientsError);
        return;
      }
      
      if (!promoRecipients || promoRecipients.length === 0) {
        setPromoStats({ sent: 0, converted: 0 });
        return;
      }
      
      const sentCount = promoRecipients.length;
      const userIds = promoRecipients.map(p => p.user_id);
      
      // Find how many of those users have made a non-cancelled booking
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("user_id")
        .in("user_id", userIds)
        .neq("status", "cancelled");
      
      if (bookingsError) {
        console.error("Error fetching bookings:", bookingsError);
        return;
      }
      
      // Count unique users who booked
      const convertedUsers = new Set(bookings?.map(b => b.user_id) || []);
      
      setPromoStats({ sent: sentCount, converted: convertedUsers.size });
    } catch (error) {
      console.error("Error calculating promo success rate:", error);
    }
  };

  const fetchPromoEligibleCount = async () => {
    try {
      // Get users who haven't received the promo, opted into marketing, created >24h ago
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: eligibleProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, created_at")
        .is("first_session_promo_sent", null)
        .eq("marketing_opt_out", false)
        .lt("created_at", twentyFourHoursAgo);
      
      if (profilesError) {
        console.error("Error fetching promo eligible profiles:", profilesError);
        return;
      }
      
      if (!eligibleProfiles || eligibleProfiles.length === 0) {
        setPromoEligibleCount(0);
        return;
      }
      
      // Filter out bulk import users (created 2026-01-18 between 07:00-08:00 UTC)
      const bulkImportStart = new Date("2026-01-18T07:00:00Z").getTime();
      const bulkImportEnd = new Date("2026-01-18T08:00:00Z").getTime();
      
      const filteredProfiles = eligibleProfiles.filter(user => {
        const createdAt = new Date(user.created_at).getTime();
        return createdAt < bulkImportStart || createdAt > bulkImportEnd;
      });
      
      // Get user_ids who have non-cancelled bookings — batch to avoid PostgREST 1000-row cap
      const userIds = filteredProfiles.map(p => p.user_id);
      const usersWithBookings = new Set<string>();
      const BATCH = 100;
      for (let i = 0; i < userIds.length; i += BATCH) {
        const chunk = userIds.slice(i, i + BATCH);
        const { data: bookings, error: bookingsError } = await supabase
          .from("bookings")
          .select("user_id")
          .in("user_id", chunk)
          .neq("status", "cancelled");
        if (bookingsError) {
          console.error("Error fetching bookings:", bookingsError);
          return;
        }
        bookings?.forEach(b => usersWithBookings.add(b.user_id));
      }

      const eligibleCount = filteredProfiles.filter(p => !usersWithBookings.has(p.user_id)).length;

      setPromoEligibleCount(eligibleCount);
    } catch (error) {
      console.error("Error counting promo eligible users:", error);
    }
  };


  useEffect(() => {
    if (composerOpen) {
      countRecipients();
    }
  }, [membershipFilter, bookingFilter, segmentFilter, composerOpen]);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (!error && data) {
      setCampaigns(data);
    }
    setIsLoading(false);
  };

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("marketing_templates")
      .select("*")
      .eq("is_active", true)
      .order("name");
    
    if (!error && data) {
      setTemplates(data);
    }
  };

  const countRecipients = async () => {
    setIsCountingRecipients(true);
    
    let query = supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("marketing_opt_out", false);
    
    if (membershipFilter !== "all") {
      query = query.eq("membership_tier", membershipFilter);
    }

    // Apply segment filter
    if (segmentFilter === "hub_launch_missed") {
      query = query.eq("custom_segment", "hub_launch_missed");
    } else if (segmentFilter === "none") {
      query = query.is("custom_segment", null);
    }

    // Apply booking count filter using total_bookings column
    if (bookingFilter === "0") {
      query = query.eq("total_bookings", 0);
    } else if (bookingFilter === "1-5") {
      query = query.gte("total_bookings", 1).lte("total_bookings", 5);
    } else if (bookingFilter === "6-10") {
      query = query.gte("total_bookings", 6).lte("total_bookings", 10);
    } else if (bookingFilter === "10+") {
      query = query.gte("total_bookings", 11);
    }
    
    const { count, error } = await query;
    
    if (!error) {
      setRecipientCount(count || 0);
    }
    
    setIsCountingRecipients(false);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setCampaignSubject(template.subject);
      setCampaignHtml(template.html_content);
    }
  };

  const openComposer = (template?: Template) => {
    setCampaignName("");
    setCampaignSubject(template?.subject || "");
    setCampaignHtml(template?.html_content || "");
    setSelectedTemplateId(template?.id || "");
    setMembershipFilter("all");
    setBookingFilter("all");
    setSegmentFilter("all");
    setComposerOpen(true);
  };

  const handlePreview = () => {
    setPreviewHtml(campaignHtml);
    setPreviewOpen(true);
  };

  const handleSendCampaign = async () => {
    if (!campaignName || !campaignSubject || !campaignHtml) {
      toast({
        title: "Missing information",
        description: "Please fill in campaign name, subject, and content.",
        variant: "destructive",
      });
      return;
    }

    if (recipientCount === 0) {
      toast({
        title: "No recipients",
        description: "No customers match your filter criteria.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      // Build filter for storing
      const recipientFilter: Record<string, string> = {};
      if (membershipFilter !== "all") {
        recipientFilter.membership_tier = membershipFilter;
      }
      if (bookingFilter !== "all") {
        recipientFilter.booking_count = bookingFilter;
      }

      // Create campaign record
      const { data: campaign, error: campaignError } = await supabase
        .from("marketing_campaigns")
        .insert([{
          name: campaignName,
          subject: campaignSubject,
          html_content: campaignHtml,
          recipient_filter: recipientFilter,
          recipient_count: recipientCount,
          status: "sending",
        }])
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Get recipients
      let recipientQuery = supabase
        .from("profiles")
        .select("email, first_name, last_name")
        .eq("marketing_opt_out", false);
      
      if (membershipFilter !== "all") {
        recipientQuery = recipientQuery.eq("membership_tier", membershipFilter);
      }

      // Apply segment filter
      if (segmentFilter === "hub_launch_missed") {
        recipientQuery = recipientQuery.eq("custom_segment", "hub_launch_missed");
      } else if (segmentFilter === "none") {
        recipientQuery = recipientQuery.is("custom_segment", null);
      }

      // Apply booking count filter
      if (bookingFilter === "0") {
        recipientQuery = recipientQuery.eq("total_bookings", 0);
      } else if (bookingFilter === "1-5") {
        recipientQuery = recipientQuery.gte("total_bookings", 1).lte("total_bookings", 5);
      } else if (bookingFilter === "6-10") {
        recipientQuery = recipientQuery.gte("total_bookings", 6).lte("total_bookings", 10);
      } else if (bookingFilter === "10+") {
        recipientQuery = recipientQuery.gte("total_bookings", 11);
      }

      const { data: recipients, error: recipientError } = await recipientQuery;
      
      if (recipientError) throw recipientError;

      // Send emails via edge function
      const { error: sendError } = await supabase.functions.invoke("send-marketing-email", {
        body: {
          campaign_id: campaign.id,
          subject: campaignSubject,
          html_content: campaignHtml,
          recipients: recipients,
        },
      });

      if (sendError) throw sendError;

      // Update campaign status
      await supabase
        .from("marketing_campaigns")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      toast({
        title: "Campaign sent!",
        description: `Email sent to ${recipientCount} recipients.`,
      });

      setComposerOpen(false);
      fetchCampaigns();
    } catch (error: any) {
      console.error("Error sending campaign:", error);
      toast({
        title: "Error sending campaign",
        description: error.message || "Failed to send campaign.",
        variant: "destructive",
      });
    }

    setIsSending(false);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "onboarding": return "bg-emerald-500/10 text-emerald-600 border-emerald-200";
      case "retention": return "bg-amber-500/10 text-amber-600 border-amber-200";
      case "promotion": return "bg-rose-500/10 text-rose-600 border-rose-200";
      case "newsletter": return "bg-blue-500/10 text-blue-600 border-blue-200";
      case "automated": return "bg-primary/10 text-primary border-primary/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const openTemplateEditor = (template: Template) => {
    setEditingTemplate(template);
    setEditSubject(template.subject);
    setEditHtml(template.html_content);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;

    setIsSavingTemplate(true);
    try {
      const { error } = await supabase
        .from("marketing_templates")
        .update({
          subject: editSubject,
          html_content: editHtml,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingTemplate.id);

      if (error) throw error;

      toast({
        title: "Template saved",
        description: "Your changes have been saved successfully.",
      });

      setEditingTemplate(null);
      fetchTemplates();
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast({
        title: "Error saving template",
        description: error.message || "Failed to save template.",
        variant: "destructive",
      });
    }
    setIsSavingTemplate(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "sent": return "bg-emerald-500/10 text-emerald-600";
      case "sending": return "bg-amber-500/10 text-amber-600";
      case "draft": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p className="text-destructive">Access denied. Admin privileges required.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-foreground">
              Marketing
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Email campaigns and templates
            </p>
          </div>
          <Button onClick={() => openComposer()} className="bg-primary hover:bg-primary/90 w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex w-full sm:inline-flex sm:w-auto overflow-x-auto no-scrollbar">
            <TabsTrigger value="campaigns" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Review Approvals
            </TabsTrigger>
            <TabsTrigger value="feedback" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Feedback
            </TabsTrigger>
            <TabsTrigger value="comp-survey" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Comp Survey
            </TabsTrigger>
          </TabsList>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : campaigns.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No campaigns yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first email campaign to reach your customers.
                  </p>
                  <Button onClick={() => openComposer()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <Card key={campaign.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-foreground">{campaign.name}</h3>
                            <Badge className={getStatusColor(campaign.status)}>
                              {campaign.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{campaign.subject}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPreviewHtml(campaign.html_content);
                            setPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span>{campaign.recipient_count} recipients</span>
                        </div>
                        {campaign.sent_at && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{format(new Date(campaign.sent_at), "MMM d, yyyy 'at' h:mm a")}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <BarChart3 className="h-4 w-4" />
                          <span>{campaign.opens} opens</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => {
                const isFirstSessionPromo = template.name === "First Session Free" && template.category === "automated";
                
                return (
                  <Card key={template.id} className="hover:border-primary/50 transition-colors relative">
                    {/* Promo counter badge for First Session Free */}
                    {isFirstSessionPromo && promoEligibleCount !== null && (
                      <div className="absolute -top-2 -right-2 z-10">
                        <div className={`px-2.5 py-1 rounded-full text-xs font-bold shadow-md ${
                          promoEligibleCount >= PROMO_THRESHOLD 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted-foreground/20 text-foreground"
                        }`}>
                          {promoEligibleCount}/{PROMO_THRESHOLD}
                        </div>
                      </div>
                    )}
                    
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          {template.category === "automated" && (
                            <Zap className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <Badge className={getCategoryColor(template.category)}>
                          {template.category}
                        </Badge>
                      </div>
                      {template.description && (
                        <CardDescription>{template.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Progress bar and success rate for First Session Free */}
                      {isFirstSessionPromo && (
                        <div className="mb-3 space-y-3">
                          {/* Eligible customers progress */}
                          {promoEligibleCount !== null && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Eligible customers</span>
                                <span className={promoEligibleCount >= PROMO_THRESHOLD ? "text-primary font-medium" : ""}>
                                  {promoEligibleCount >= PROMO_THRESHOLD ? "Ready to trigger!" : `${PROMO_THRESHOLD - promoEligibleCount} more needed`}
                                </span>
                              </div>
                              <Progress 
                                value={Math.min((promoEligibleCount / PROMO_THRESHOLD) * 100, 100)} 
                                className="h-2"
                              />
                            </div>
                          )}
                          
                          {/* Success rate metric */}
                          {promoStats && promoStats.sent > 0 && (
                            <div className="p-2 bg-accent/20 rounded-lg border border-accent/30">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Success rate</span>
                                <span className="font-semibold text-accent-foreground">
                                  {Math.round((promoStats.converted / promoStats.sent) * 100)}%
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {promoStats.converted} of {promoStats.sent} recipients have booked
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <p className="text-sm text-muted-foreground mb-3">
                        Subject: {template.subject}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPreviewHtml(template.html_content);
                            setPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                        {template.category === "automated" ? (
                          <Button
                            size="sm"
                            onClick={() => openTemplateEditor(template)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => openComposer(template)}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Use Template
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
          {/* Review Approvals Tab */}
          <TabsContent value="reviews" className="mt-4">
            <ReviewApprovals />
          </TabsContent>

          {/* Feedback Tab Content */}
          <FeedbackTab activeTab={activeTab} />

          {/* Comp Survey Tab */}
          <CompSurveyTab activeTab={activeTab} />
        </Tabs>

        {/* Composer Dialog */}
        <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                Create Campaign
              </DialogTitle>
              <DialogDescription>
                Compose and send an email campaign to your customers.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              {/* Campaign Name */}
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. December Newsletter"
                />
              </div>

              {/* Template Selection */}
              <div className="space-y-2">
                <Label>Start from Template (optional)</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <Label>Email Subject</Label>
                <Input
                  value={campaignSubject}
                  onChange={(e) => setCampaignSubject(e.target.value)}
                  placeholder="Enter email subject line..."
                />
              </div>

              {/* HTML Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Email Content (HTML)</Label>
                  <Button variant="ghost" size="sm" onClick={handlePreview}>
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                </div>
                <Textarea
                  value={campaignHtml}
                  onChange={(e) => setCampaignHtml(e.target.value)}
                  placeholder="Paste your HTML email content here..."
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{first_name}"}, {"{last_name}"}, {"{email}"} for personalization.
                </p>
              </div>

              {/* Recipient Filters */}
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <Label className="text-base font-medium">Recipients</Label>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Custom Segment</Label>
                    <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEGMENT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Membership Tier</Label>
                    <Select value={membershipFilter} onValueChange={setMembershipFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_CUSTOMERS_OPTION.value}>
                          {ALL_CUSTOMERS_OPTION.label}
                        </SelectItem>
                        {pricing.map((t) => (
                          <SelectItem key={t.tier} value={t.tier}>
                            {t.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs">Booking Count</Label>
                    <Select value={bookingFilter} onValueChange={setBookingFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BOOKING_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {isCountingRecipients ? (
                    <span className="text-muted-foreground">Counting...</span>
                  ) : (
                    <span className="font-medium">{recipientCount} recipients</span>
                  )}
                  <span className="text-muted-foreground">will receive this email</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setComposerOpen(false)}
                  disabled={isSending}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleSendCampaign}
                  disabled={isSending || recipientCount === 0}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Campaign
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Email Preview</DialogTitle>
            </DialogHeader>
            <EmailPreviewFrame html={previewHtml} />
          </DialogContent>
        </Dialog>

        {/* Template Editor Dialog */}
        <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Edit Automated Template: {editingTemplate?.name}
              </DialogTitle>
              <DialogDescription>
                Changes will be used the next time this automated campaign runs.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="edit-subject">Subject Line</Label>
                <Input
                  id="edit-subject"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Email subject..."
                />
                <p className="text-xs text-muted-foreground">
                  Available tags: {"{first_name}"}, {"{last_name}"}, {"{email}"}
                </p>
              </div>

              {/* HTML Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-html">HTML Content</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPreviewHtml(editHtml);
                      setPreviewOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                </div>
                <Textarea
                  id="edit-html"
                  value={editHtml}
                  onChange={(e) => setEditHtml(e.target.value)}
                  className="min-h-[350px] font-mono text-sm"
                  placeholder="Paste HTML content..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditingTemplate(null)}
                  disabled={isSavingTemplate}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleSaveTemplate}
                  disabled={isSavingTemplate}
                >
                  {isSavingTemplate ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Template"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </AdminLayout>
  );
}

// ───── Feedback Tab Component ─────
function FeedbackTab({ activeTab }: { activeTab: string }) {
  const { toast } = useToast();
  const [feedbackResponses, setFeedbackResponses] = useState<any[]>([]);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  useEffect(() => {
    if (activeTab === "feedback") {
      fetchFeedback();
    }
  }, [activeTab]);

  const fetchFeedback = async () => {
    setIsLoadingFeedback(true);
    const { data, error } = await supabase
      .from("feedback_responses" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      setFeedbackResponses(data as any[]);
    }
    setIsLoadingFeedback(false);
  };

  const handleTriggerFeedbackCampaign = async () => {
    setIsSendingFeedback(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-feedback-request");
      if (error) throw error;

      toast({
        title: "Feedback campaign sent",
        description: `Sent ${data.sent} feedback request emails to lapsed visitors.`,
      });
      fetchFeedback();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send feedback campaign.",
        variant: "destructive",
      });
    }
    setIsSendingFeedback(false);
  };

  const getScoreIcon = (score: string) => {
    switch (score) {
      case "bad": return <Frown className="h-5 w-5 text-red-500" />;
      case "ok": return <Meh className="h-5 w-5 text-amber-500" />;
      case "good": return <Smile className="h-5 w-5 text-emerald-600" />;
      default: return null;
    }
  };

  const getScoreBadge = (score: string) => {
    switch (score) {
      case "bad": return "bg-red-100 text-red-700 border-red-200";
      case "ok": return "bg-amber-100 text-amber-700 border-amber-200";
      case "good": return "bg-emerald-100 text-emerald-700 border-emerald-200";
      default: return "";
    }
  };

  // Score summary
  const scoreCounts = feedbackResponses.reduce((acc, r) => {
    acc[r.score] = (acc[r.score] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (activeTab !== "feedback") return null;

  return (
    <TabsContent value="feedback" className="mt-4 space-y-4" forceMount>
      {/* Summary + Trigger */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Smile className="h-8 w-8 text-emerald-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-foreground">{scoreCounts.good || 0}</div>
            <div className="text-xs text-muted-foreground">Good</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Meh className="h-8 w-8 text-amber-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-foreground">{scoreCounts.ok || 0}</div>
            <div className="text-xs text-muted-foreground">OK</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Frown className="h-8 w-8 text-red-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-foreground">{scoreCounts.bad || 0}</div>
            <div className="text-xs text-muted-foreground">Bad</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <Button
              onClick={handleTriggerFeedbackCampaign}
              disabled={isSendingFeedback}
              className="bg-accent hover:bg-accent/90 text-accent-foreground w-full"
            >
              {isSendingFeedback ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Feedback Requests
                </>
              )}
            </Button>
             <p className="text-xs text-muted-foreground mt-2 text-center">
               Sent daily, 24hrs after first session
             </p>
          </CardContent>
        </Card>
      </div>

      {/* Responses list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feedback Responses</CardTitle>
          <CardDescription>
            {feedbackResponses.length} response{feedbackResponses.length !== 1 ? "s" : ""} received
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingFeedback ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : feedbackResponses.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No feedback yet. Send some requests!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbackResponses.map((response: any) => (
                <div
                  key={response.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
                >
                  <div className="mt-0.5">{getScoreIcon(response.score)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm">
                        {response.name || "Anonymous"}
                      </span>
                      <Badge variant="outline" className={`text-xs ${getScoreBadge(response.score)}`}>
                        {response.score.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(response.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                    {response.comment && (
                      <p className="text-sm text-muted-foreground mt-1">{response.comment}</p>
                    )}
                    {response.email && (
                      <p className="text-xs text-muted-foreground/70 mt-1">{response.email}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// ───── Comp Survey Tab Component ─────
function CompSurveyTab({ activeTab }: { activeTab: string }) {
  const [responses, setResponses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (activeTab === "comp-survey") {
      fetchResponses();
    }
  }, [activeTab]);

  const fetchResponses = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("comp_survey_responses")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setResponses(data);
    }
    setIsLoading(false);
  };

  // Tally helpers
  const tally = (field: string) => {
    const counts: Record<string, number> = {};
    responses.forEach((r: any) => {
      const val = r[field];
      if (val) counts[val] = (counts[val] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const dayTally = tally("preferred_day");
  const timeTally = tally("preferred_time");
  const feeTally = tally("preferred_entry_fee");

  if (activeTab !== "comp-survey") return null;

  return (
    <TabsContent value="comp-survey" className="mt-4 space-y-4" forceMount>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Day Preferences */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Preferred Day</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dayTally.length === 0 ? (
              <p className="text-sm text-muted-foreground">No responses yet</p>
            ) : dayTally.map(([day, count]) => (
              <div key={day} className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{day}</span>
                <div className="flex items-center gap-2">
                  <Progress value={(count / responses.length) * 100} className="w-20 h-2" />
                  <span className="text-sm font-bold text-primary w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Time Preferences */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Preferred Time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {timeTally.length === 0 ? (
              <p className="text-sm text-muted-foreground">No responses yet</p>
            ) : timeTally.map(([time, count]) => (
              <div key={time} className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{time}</span>
                <div className="flex items-center gap-2">
                  <Progress value={(count / responses.length) * 100} className="w-20 h-2" />
                  <span className="text-sm font-bold text-primary w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Fee Preferences */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Preferred Entry Fee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {feeTally.length === 0 ? (
              <p className="text-sm text-muted-foreground">No responses yet</p>
            ) : feeTally.map(([fee, count]) => (
              <div key={fee} className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{fee}</span>
                <div className="flex items-center gap-2">
                  <Progress value={(count / responses.length) * 100} className="w-20 h-2" />
                  <span className="text-sm font-bold text-primary w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Total responses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Individual Responses</CardTitle>
          <CardDescription>
            {responses.length} response{responses.length !== 1 ? "s" : ""} received
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : responses.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No survey responses yet. Send the campaign!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {responses.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{r.name || r.email || "Anonymous"}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-1 text-muted-foreground text-xs">
                      <span>📅 {r.preferred_day}</span>
                      <span>🕐 {r.preferred_time}</span>
                      <span>💰 {r.preferred_entry_fee}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}