import { HIGHLIGHTS_ENABLED } from "@/config/features";
import * as React from "react";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Settings, ShoppingCart, Bell, DollarSign, X, Copy, Check, Eye, BarChart3, AlertTriangle, Loader2, GripVertical, ArrowUp, ArrowDown, Coffee, ChevronDown, Gift, Building2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SalesReporting } from "@/components/admin/SalesReporting";
import { LoyaltyPromoSettings } from "@/components/admin/LoyaltyPromoSettings";
import { PackProductsSettings } from "@/components/admin/PackProductsSettings";
import { PricingRatesSettings } from "@/components/admin/PricingRatesSettings";
import { POSCategoriesSettings } from "@/components/admin/POSCategoriesSettings";


import { ActivityLog } from "@/components/admin/ActivityLog";
import VenueDetailsSection from "@/components/admin/VenueDetailsSection";
import { TableServiceSettings } from "@/components/admin/TableServiceSettings";
import { DailyHoursEditor } from "@/components/admin/DailyHoursEditor";
import { PublicHolidaysSection } from "@/components/admin/PublicHolidaysSection";
import { SmsTemplatesSection } from "@/components/admin/SmsTemplatesSection";
import { DoorAccessSection } from "@/components/admin/DoorAccessSection";

import { EmailLayoutEditor } from "@/components/admin/EmailLayoutEditor";
import { EmailPreviewFrame } from "@/components/admin/EmailPreviewFrame";
import { format } from "date-fns";

// Template types and their available placeholder tags
const TEMPLATE_TAGS: Record<string, { tag: string; description: string }[]> = {
  booking_confirmation: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{booking_date}", description: "Date of the booking (e.g. Monday, 15 January 2025)" },
    { tag: "{booking_time}", description: "Start time of the booking (e.g. 2:00 PM)" },
    { tag: "{end_time}", description: "End time of the booking (e.g. 4:00 PM)" },
    { tag: "{duration}", description: "Booking duration in hours (e.g. 2)" },
    { tag: "{bay_number}", description: "Bay number (e.g. 3)" },
    { tag: "{bay_name}", description: "Bay name (e.g. Bay 3)" },
    { tag: "{player_count}", description: "Number of players" },
    { tag: "{total_price}", description: "Total booking price (e.g. $60.00)" },
    { tag: "{door_code}", description: "Door access code (7675#)" },
    { tag: "{staffed_status}", description: "Staffed hours / Unstaffed hours indicator" },
  ],
  booking_confirmation_first_unstaffed: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{booking_date}", description: "Date of the booking" },
    { tag: "{booking_time}", description: "Start time (e.g. 2:00 PM)" },
    { tag: "{end_time}", description: "End time (e.g. 4:00 PM)" },
    { tag: "{bay_number}", description: "Bay number" },
    { tag: "{bay_name}", description: "Bay name" },
    { tag: "{door_code}", description: "Door access code" },
    { tag: "{staffed_status}", description: "Staffed hours / Unstaffed hours indicator" },
  ],

  booking_cancellation: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{booking_date}", description: "Date of the cancelled booking" },
    { tag: "{booking_time}", description: "Start time of the cancelled booking" },
    { tag: "{bay_number}", description: "Bay number" },
    { tag: "{bay_name}", description: "Bay name" },
    { tag: "{refund_amount}", description: "Refund amount if applicable" },
    { tag: "{staffed_status}", description: "Staffed hours / Unstaffed hours indicator" },
  ],
  credit_added: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{deposit_amount}", description: "Amount of credit added (e.g. $50.00)" },
    { tag: "{new_balance}", description: "New total credit balance (e.g. $75.00)" },
    { tag: "{previous_balance}", description: "Previous credit balance (e.g. $25.00)" },
  ],
  welcome: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
  ],
  membership_activated: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{tier_name}", description: "Membership tier name (e.g. Birdie)" },
    { tag: "{weekly_price}", description: "Weekly subscription price (e.g. $20.00)" },
  ],
  membership_cancelled: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{tier_name}", description: "Previous membership tier name" },
  ],
  payment_failed: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{tier_name}", description: "Previous membership tier name" },
  ],
  loyalty_credit: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{credit_amount}", description: "Loyalty credit amount (e.g. $35.00)" },
    { tag: "{new_balance}", description: "New total credit balance" },
    { tag: "{total_visits}", description: "Total number of visits/bookings" },
    { tag: "{next_milestone}", description: "Number of visits for next loyalty credit" },
  ],
  league_welcome: [
    { tag: "{first_name}", description: "Player's first name" },
    { tag: "{handicap}", description: "Starting handicap that was applied (e.g. 12.5 or 'Combo (auto)')" },
    { tag: "{guide_url}", description: "Link to the league player guide" },
  ],
  pack_purchase: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{email}", description: "Customer's email address" },
    { tag: "{pack_name}", description: "Name of the pack purchased (e.g. Practice Pack)" },
    { tag: "{hours}", description: "Hours included in the pack (e.g. 5)" },
    { tag: "{price}", description: "Amount paid (e.g. $150.00)" },
    { tag: "{validity_days}", description: "Validity period in days (e.g. 90)" },
    { tag: "{expiry_date}", description: "Date the hours expire (e.g. 5 November 2026)" },
    { tag: "{balance_hours}", description: "Total prepaid hours balance after purchase" },
  ],
  corporate_pack_purchase: [
    { tag: "{first_name}", description: "Buyer's first name" },
    { tag: "{last_name}", description: "Buyer's last name" },
    { tag: "{email}", description: "Buyer's email address" },
    { tag: "{company_name}", description: "Corporate account company name" },
    { tag: "{company_line}", description: "Reads ' for Acme Pty Ltd' — blank if no company name" },
    { tag: "{pack_name}", description: "Name of the corporate pack purchased" },
    { tag: "{hours}", description: "Hours included in the pack (e.g. 50)" },
    { tag: "{price}", description: "Amount paid (e.g. $1000.00)" },
    { tag: "{validity_days}", description: "Validity period in days (e.g. 365)" },
    { tag: "{expiry_date}", description: "Date the hours expire" },
    { tag: "{balance_hours}", description: "Shared company wallet balance after purchase" },
  ],
  pack_redeemed: [
    { tag: "{first_name}", description: "Redeemer's first name" },
    { tag: "{last_name}", description: "Redeemer's last name" },
    { tag: "{email}", description: "Redeemer's email address" },
    { tag: "{pack_name}", description: "Name of the pack redeemed" },
    { tag: "{hours}", description: "Hours added to their balance" },
    { tag: "{balance_hours}", description: "Total prepaid hours balance after redeeming" },
    { tag: "{validity_days}", description: "Validity period in days" },
    { tag: "{expiry_date}", description: "Date the hours expire" },
    { tag: "{redemption_code}", description: "The code that was redeemed" },
    { tag: "{purchaser_name}", description: "Name of the person who bought the pack (if known)" },
  ],
  corporate_staff_invite: [
    { tag: "{first_name}", description: "Staff member's first name (if they already have an account)" },
    { tag: "{email}", description: "Staff member's email address" },
    { tag: "{company_name}", description: "Company account name" },
    { tag: "{owner_name}", description: "Name of the company account owner" },
    { tag: "{monthly_cap}", description: "Monthly hour cap, blank if unlimited" },
    { tag: "{cap_line}", description: "Ready-made sentence about their monthly hour allowance" },
  ],
  gift_card_recipient_applied: GIFT_CARD_TAGS(),
  gift_card_recipient_signup: GIFT_CARD_TAGS(),
  gift_card_printable: GIFT_CARD_TAGS(),
  gift_card_admin_issued: GIFT_CARD_TAGS(),
};

const GIFT_CARD_KEYS = [
  "gift_card_recipient_applied",
  "gift_card_recipient_signup",
  "gift_card_printable",
  "gift_card_admin_issued",
];

function GIFT_CARD_TAGS() {
  return [
    { tag: "{recipient_name}", description: "Name of the person receiving the gift card" },
    { tag: "{sender_name}", description: "Name of the purchaser (or the venue for staff-issued cards)" },
    { tag: "{amount}", description: "Gift card value (e.g. $100.00)" },
    { tag: "{redemption_code}", description: "Gift card redemption code (e.g. UF-A2B4C6)" },
    { tag: "{personal_message}", description: "The purchaser's message, plain text" },
    { tag: "{personal_message_block}", description: "The purchaser's message pre-styled in a quote card" },
    { tag: "{venue_name}", description: "Venue name" },
    { tag: "{signup_url}", description: "Link to create an account / sign in" },
  ];
}



interface EmailTemplateDB {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  subject: string | null;
  html_content: string | null;
  is_active: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  templateKey: string;
}

interface POSProduct {
  id: string;
  name: string;
  price: number;
  family: string | null;
  is_active: boolean;
  display_order: number;
}

interface CustomerProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  membership_tier: string;
  custom_hourly_rate: number | null;
}

interface Bay {
  id: string;
  bay_number: number;
  name: string;
  is_active: boolean;
}

interface BayDevice {
  id: string;
  bay_id: string;
  obs_ws_url: string | null;
  obs_ws_password: string | null;
  is_online: boolean;
  last_seen: string | null;
  app_version: string | null;
}

interface BayBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  profiles: {
    first_name: string;
    last_name: string;
  } | null;
}

const SETTINGS_TABS = ["general", "reporting", "pricing", "pos", "notifications"] as const;

export default function AdminSettings() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const activeTab = (SETTINGS_TABS as readonly string[]).includes(tabParam) ? tabParam : "general";
  const { toast } = useToast();

  // Timezone is hardcoded to Australia/Brisbane project-wide (no admin control)


  // League Highlights settings
  const [highlightRecordingEnabled, setHighlightRecordingEnabled] = useState(false);
  const [isSavingHighlights, setIsSavingHighlights] = useState(false);

  // Bay device settings (OBS WebSocket per bay)
  const [bayDevices, setBayDevices] = useState<Record<string, BayDevice>>({});
  const [bayDeviceForm, setBayDeviceForm] = useState<Record<string, { obs_ws_url: string; obs_ws_password: string }>>({});
  const [savingBayDevice, setSavingBayDevice] = useState<string | null>(null);
  const [expandedBayDevice, setExpandedBayDevice] = useState<string | null>(null);

  // Initialize bay device form values when devices load
  useEffect(() => {
    const initial: Record<string, { obs_ws_url: string; obs_ws_password: string }> = {};
    for (const bayId of Object.keys(bayDevices)) {
      const device = bayDevices[bayId];
      initial[bayId] = {
        obs_ws_url: device?.obs_ws_url || "ws://127.0.0.1:4455",
        obs_ws_password: device?.obs_ws_password || "",
      };
    }
    setBayDeviceForm(initial);
  }, [bayDevices]);

  // Load highlight settings from database on mount
  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("highlight_recording_enabled")
        .eq("id", "global")
        .single();

      if (data?.highlight_recording_enabled !== undefined) {
        setHighlightRecordingEnabled(data.highlight_recording_enabled);
      }
    };

    if (isAdmin) {
      loadSettings();
    }
  }, [isAdmin]);


  // POS Products
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<POSProduct | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productFamily, setProductFamily] = useState("");
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Dynamic Pricing
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [customersWithPricing, setCustomersWithPricing] = useState<CustomerProfile[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedPricingCustomer, setSelectedPricingCustomer] = useState<CustomerProfile | null>(null);
  const [newCustomRate, setNewCustomRate] = useState("");
  const [isSavingRate, setIsSavingRate] = useState(false);

  // Bay Management
  const [bays, setBays] = useState<Bay[]>([]);
  const [isLoadingBays, setIsLoadingBays] = useState(true);
  const [bayBookings, setBayBookings] = useState<Record<string, BayBooking[]>>({});
  const [togglingBay, setTogglingBay] = useState<string | null>(null);


  // Category suggestions: managed POS categories plus anything already used by a product
  const [posCategoryNames, setPosCategoryNames] = useState<string[]>([]);
  const families = [...new Set([
    ...posCategoryNames,
    ...products.map(p => p.family).filter(Boolean) as string[],
  ])];

  useEffect(() => {
    supabase
      .from("pos_categories")
      .select("name")
      .order("display_order")
      .then(({ data }) => setPosCategoryNames((data || []).map(c => c.name)));
  }, []);


  // Email Templates
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateDB[]>([]);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplateDB | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [templateHtml, setTemplateHtml] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const fetchEmailTemplates = async () => {
    setIsLoadingTemplates(true);
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("name");
    
    if (!error && data) {
      setEmailTemplates(data);
    }
    setIsLoadingTemplates(false);
  };

  const openTemplateEditor = (template: EmailTemplateDB) => {
    setSelectedTemplate({
      id: template.id,
      name: template.name,
      description: template.description || "",
      templateKey: template.template_key,
    });
    setTemplateHtml(template.html_content || "");
    setTemplateSubject(template.subject || "");
  };

  const toggleTemplateActive = async (template: EmailTemplateDB) => {
    try {
      const { error } = await supabase
        .from("email_templates")
        .update({ is_active: !template.is_active })
        .eq("id", template.id);

      if (error) throw error;

      toast({
        title: template.is_active ? "Template disabled" : "Template enabled",
        description: `${template.name} email notifications are now ${template.is_active ? "off" : "on"}.`,
        duration: 3000,
      });

      fetchEmailTemplates();
    } catch (error: any) {
      toast({
        title: "Error updating template",
        description: error.message || "Failed to update template status.",
        variant: "destructive",
        duration: 4000,
      });
    }
  };

  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    
    setIsSavingTemplate(true);
    try {
      const { error } = await supabase
        .from("email_templates")
        .update({
          html_content: templateHtml || null,
          subject: templateSubject || null,
        })
        .eq("template_key", selectedTemplate.templateKey);

      if (error) throw error;

      toast({
        title: "Template saved",
        description: `${selectedTemplate.name} template has been updated.`,
        duration: 4000,
      });

      setSelectedTemplate(null);
      fetchEmailTemplates();
    } catch (error: any) {
      toast({
        title: "Error saving template",
        description: error.message || "Failed to save template.",
        variant: "destructive",
        duration: 4000,
      });
    }
    setIsSavingTemplate(false);
  };

  const deleteTemplate = async (template: EmailTemplateDB) => {
    try {
      const { error } = await supabase
        .from("email_templates")
        .delete()
        .eq("id", template.id);

      if (error) throw error;

      toast({
        title: "Template deleted",
        description: `${template.name} has been removed.`,
        duration: 3000,
      });

      setTemplateToDelete(null);
      setSelectedTemplate((prev) => (prev?.id === template.id ? null : prev));
      fetchEmailTemplates();
    } catch (error: any) {
      toast({
        title: "Error deleting template",
        description: error.message || "Failed to delete template.",
        variant: "destructive",
        duration: 4000,
      });
    }
  };


  // Fetch bays, their devices, and upcoming bookings
  const fetchBays = async () => {
    setIsLoadingBays(true);
    const { data, error } = await supabase
      .from("bays")
      .select("id, bay_number, name, is_active")
      .order("bay_number");

    if (!error && data) {
      setBays(data);
      // Fetch bay devices for all bays in one query
      const { data: devices } = await supabase
        .from("bay_devices")
        .select("id, bay_id, obs_ws_url, obs_ws_password, is_online, last_seen, app_version");
      
      const devicesMap: Record<string, BayDevice> = {};
      for (const device of (devices || [])) {
        devicesMap[device.bay_id] = device;
      }
      setBayDevices(devicesMap);

      // Fetch only truly upcoming bookings (end time in the future)
      const now = new Date();
      const today = format(now, "yyyy-MM-dd");
      const currentTime = format(now, "HH:mm:ss");
      const bookingsMap: Record<string, BayBooking[]> = {};
      
      for (const bay of data) {
        const { data: bookings } = await supabase
          .from("bookings")
          .select("id, booking_date, start_time, end_time, user_id")
          .eq("bay_id", bay.id)
          .eq("status", "confirmed")
          .gte("booking_date", today)
          .order("booking_date")
          .order("start_time")
          .limit(10); // Fetch more to filter locally
        
        // Filter out past bookings (where end_time has passed for today's bookings)
        const upcomingOnly = (bookings || []).filter(booking => {
          if (booking.booking_date > today) return true;
          // For today's bookings, check if end_time is still in the future
          return booking.end_time > currentTime;
        }).slice(0, 5);
        
        // Fetch profile info for each upcoming booking
        const bookingsWithProfiles: BayBooking[] = [];
        for (const booking of upcomingOnly) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("user_id", booking.user_id)
            .single();
          
          bookingsWithProfiles.push({
            id: booking.id,
            booking_date: booking.booking_date,
            start_time: booking.start_time,
            end_time: booking.end_time,
            profiles: profile || null,
          });
        }
        bookingsMap[bay.id] = bookingsWithProfiles;
      }
      setBayBookings(bookingsMap);
    }
    setIsLoadingBays(false);
  };

  const toggleBayStatus = async (bay: Bay) => {
    // If trying to take offline, check for bookings
    if (bay.is_active) {
      const upcomingBookings = bayBookings[bay.id] || [];
      if (upcomingBookings.length > 0) {
        toast({
          title: "Cannot take bay offline",
          description: `${bay.name} has ${upcomingBookings.length} upcoming booking(s). Please move them to another bay first.`,
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
    }

    setTogglingBay(bay.id);
    const { error } = await supabase
      .from("bays")
      .update({ is_active: !bay.is_active })
      .eq("id", bay.id);

    if (error) {
      toast({
        title: "Error updating bay",
        description: error.message,
        variant: "destructive",
        duration: 4000,
      });
    } else {
      toast({
        title: bay.is_active ? "Bay taken offline" : "Bay brought online",
        description: `${bay.name} is now ${bay.is_active ? "offline" : "online"}.`,
        duration: 3000,
      });
      fetchBays();
    }
    setTogglingBay(null);
  };

  // Save global League Highlights settings
  const saveHighlightSettings = async () => {
    setIsSavingHighlights(true);
    const { error } = await supabase
      .from("system_settings")
      .update({
        highlight_recording_enabled: highlightRecordingEnabled,
      })
      .eq("id", "global");

    if (error) {
      toast({
        title: "Error saving highlight settings",
        description: error.message,
        variant: "destructive",
        duration: 4000,
      });
    } else {
      toast({
        title: "Highlight settings saved",
        description: "League recording configuration updated.",
        duration: 3000,
      });
    }
    setIsSavingHighlights(false);
  };

  // Save per-bay OBS WebSocket settings
  const saveBayDeviceSettings = async (bayId: string) => {
    const form = bayDeviceForm[bayId];
    if (!form) return;

    setSavingBayDevice(bayId);
    const device = bayDevices[bayId];
    const payload = {
      bay_id: bayId,
      obs_ws_url: form.obs_ws_url || null,
      obs_ws_password: form.obs_ws_password || null,
    };

    const { error } = device?.id
      ? await supabase.from("bay_devices").update(payload).eq("id", device.id)
      : await supabase.from("bay_devices").insert(payload);

    if (error) {
      toast({
        title: "Error saving device settings",
        description: error.message,
        variant: "destructive",
        duration: 4000,
      });
    } else {
      toast({
        title: "Device settings saved",
        description: "OBS WebSocket credentials updated for this bay.",
        duration: 3000,
      });
      fetchBays();
    }
    setSavingBayDevice(null);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchBays();
      fetchProducts();
      fetchCustomers();
      fetchEmailTemplates();
    }
  }, [isAdmin]);


  const fetchProducts = async () => {
    setIsLoadingProducts(true);
    const { data, error } = await supabase
      .from("pos_products")
      .select("*")
      .order("display_order", { ascending: true });

    if (!error && data) {
      setProducts(data);
    }
    setIsLoadingProducts(false);
  };

  const moveProduct = async (productId: string, direction: 'up' | 'down') => {
    const currentIndex = products.findIndex(p => p.id === productId);
    if (currentIndex === -1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= products.length) return;

    const currentProduct = products[currentIndex];
    const targetProduct = products[targetIndex];

    // Swap display orders
    const currentOrder = currentProduct.display_order;
    const targetOrder = targetProduct.display_order;

    // Update locally first for instant feedback
    const newProducts = [...products];
    newProducts[currentIndex] = { ...currentProduct, display_order: targetOrder };
    newProducts[targetIndex] = { ...targetProduct, display_order: currentOrder };
    newProducts.sort((a, b) => a.display_order - b.display_order);
    setProducts(newProducts);

    // Persist to database
    const { error: error1 } = await supabase
      .from("pos_products")
      .update({ display_order: targetOrder })
      .eq("id", currentProduct.id);

    const { error: error2 } = await supabase
      .from("pos_products")
      .update({ display_order: currentOrder })
      .eq("id", targetProduct.id);

    if (error1 || error2) {
      toast({
        title: "Error reordering",
        description: "Failed to save product order.",
        variant: "destructive",
        duration: 4000,
      });
      fetchProducts(); // Refetch to reset on error
    }
  };

  const fetchCustomers = async () => {
    setIsLoadingCustomers(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, first_name, last_name, email, membership_tier, custom_hourly_rate")
      .order("last_name");

    if (!error && data) {
      setCustomers(data);
      setCustomersWithPricing(data.filter((c: CustomerProfile) => c.custom_hourly_rate !== null));
    }
    setIsLoadingCustomers(false);
  };

  const saveCustomRate = async () => {
    if (!selectedPricingCustomer) return;

    setIsSavingRate(true);
    try {
      const rate = newCustomRate ? parseFloat(newCustomRate) : null;
      
      const { error } = await supabase
        .from("profiles")
        .update({ custom_hourly_rate: rate })
        .eq("id", selectedPricingCustomer.id);

      if (error) throw error;

      toast({
        title: rate ? "Custom rate set" : "Custom rate removed",
        description: rate 
          ? `${selectedPricingCustomer.first_name} ${selectedPricingCustomer.last_name} now has a custom rate of $${rate}/hr.`
          : `${selectedPricingCustomer.first_name} ${selectedPricingCustomer.last_name} will use their tier rate.`,
        duration: 4000,
      });

      setSelectedPricingCustomer(null);
      setNewCustomRate("");
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save custom rate.",
        variant: "destructive",
        duration: 4000,
      });
    }
    setIsSavingRate(false);
  };

  const removeCustomRate = async (customer: CustomerProfile) => {
    const { error } = await supabase
      .from("profiles")
      .update({ custom_hourly_rate: null })
      .eq("id", customer.id);

    if (!error) {
      toast({
        title: "Custom rate removed",
        description: `${customer.first_name} ${customer.last_name} will use their tier rate.`,
        duration: 4000,
      });
      fetchCustomers();
    }
  };

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const search = customerSearch.toLowerCase();
    const fullName = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
    return (
      fullName.includes(search) ||
      c.first_name?.toLowerCase().includes(search) ||
      c.last_name?.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search)
    );
  });

  const openProductDialog = (product?: POSProduct) => {
    if (product) {
      setEditingProduct(product);
      setProductName(product.name);
      setProductPrice(product.price.toString());
      setProductFamily(product.family || "");
    } else {
      setEditingProduct(null);
      setProductName("");
      setProductPrice("");
      setProductFamily("");
    }
    setShowProductDialog(true);
  };

  const saveProduct = async () => {
    if (!productName || !productPrice) {
      toast({
        title: "Missing information",
        description: "Please enter product name and price.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsSavingProduct(true);

    try {
      const productData = {
        name: productName,
        price: parseFloat(productPrice),
        family: productFamily || null,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("pos_products")
          .update(productData)
          .eq("id", editingProduct.id);

        if (error) throw error;
        toast({ title: "Product updated", duration: 4000 });
      } else {
        const { error } = await supabase
          .from("pos_products")
          .insert(productData);

        if (error) throw error;
        toast({ title: "Product created", duration: 4000 });
      }

      setShowProductDialog(false);
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save product.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsSavingProduct(false);
  };

  const toggleProductActive = async (product: POSProduct) => {
    const { error } = await supabase
      .from("pos_products")
      .update({ is_active: !product.is_active })
      .eq("id", product.id);

    if (!error) {
      toast({
        title: product.is_active ? "Product disabled" : "Product enabled",
        duration: 4000,
      });
      fetchProducts();
    }
  };

  const deleteProduct = async (product: POSProduct) => {
    if (!confirm(`Delete "${product.name}"?`)) return;

    const { error } = await supabase
      .from("pos_products")
      .delete()
      .eq("id", product.id);

    if (!error) {
      toast({ title: "Product deleted", duration: 4000 });
      fetchProducts();
    }
  };

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[400px]" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl lg:text-3xl uppercase tracking-wide text-foreground">
              Settings
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage platform configuration
            </p>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
          className="space-y-6"
        >
          <TabsList className="grid w-full max-w-2xl grid-cols-5">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="reporting" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Reporting</span>
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Pricing</span>
            </TabsTrigger>
            <TabsTrigger value="pos" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">POS</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-4">
            {/* Venue Details */}
            <CollapsibleSection title="Venue Details" description="Venue name, contact details, domains and address used across the site, emails and legal pages">
              <VenueDetailsSection />
            </CollapsibleSection>

            {/* Activity Log */}
            <CollapsibleSection title="Activity Log" description="Recent authentication events and user activity">
              <ActivityLog />
            </CollapsibleSection>




            {/* Bay Management */}
            <CollapsibleSection title="Bay Management" description="Control bay availability and per-bay device settings.">
              <Card>
                <CardContent className="space-y-6 pt-6">
                  {/* League Highlights global settings */}
                  {HIGHLIGHTS_ENABLED && (
                  <div className="p-4 border rounded-lg bg-muted/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">League Highlights</h3>
                        <p className="text-sm text-muted-foreground">
                          Auto-record GSPro sessions for SGT rounds and add hole chapter markers.
                        </p>
                      </div>
                      <Switch
                        checked={highlightRecordingEnabled}
                        onCheckedChange={(checked) => {
                          setHighlightRecordingEnabled(checked);
                          // Auto-save when toggled
                          setTimeout(() => saveHighlightSettings(), 0);
                        }}
                        disabled={isSavingHighlights}
                      />
                    </div>

                    {highlightRecordingEnabled && (
                      <p className="text-xs text-muted-foreground">
                        Recording is active on <strong>all bays</strong> where OBS Studio is installed and configured. Bays without OBS silently skip recording.
                      </p>
                    )}
                  </div>
                  )}


                  {isLoadingBays ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bays.map((bay) => {
                        const upcomingBookings = bayBookings[bay.id] || [];
                        const hasBookings = upcomingBookings.length > 0;
                        const isToggling = togglingBay === bay.id;
                        const device = bayDevices[bay.id];
                        const isExpanded = expandedBayDevice === bay.id;
                        const form = bayDeviceForm[bay.id] || { obs_ws_url: "ws://127.0.0.1:4455", obs_ws_password: "" };

                        return (
                          <div
                            key={bay.id}
                            className={`p-4 border rounded-lg ${bay.is_active ? "bg-background" : "bg-muted/50"}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${bay.is_active ? "bg-green-500" : "bg-red-500"}`} />
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{bay.name}</span>
                                  <Badge variant={bay.is_active ? "default" : "secondary"}>
                                    {bay.is_active ? "Online" : "Offline"}
                                  </Badge>
                                  {device?.is_online && (
                                    <Badge variant="outline" className="text-xs">Controller Online</Badge>
                                  )}
                                  {device?.app_version && (
                                    <span className="text-xs text-muted-foreground">v{device.app_version}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {isToggling ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Switch
                                    checked={bay.is_active}
                                    onCheckedChange={() => toggleBayStatus(bay)}
                                    disabled={isToggling}
                                  />
                                )}
                              </div>
                            </div>

                            {bay.is_active && hasBookings && (
                              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <div className="text-sm">
                                    <p className="font-medium text-amber-600 dark:text-amber-400">
                                      {upcomingBookings.length} upcoming booking{upcomingBookings.length > 1 ? "s" : ""}
                                    </p>
                                    <p className="text-muted-foreground text-xs mt-1">
                                      Move bookings before taking offline:
                                    </p>
                                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                                      {upcomingBookings.slice(0, 3).map((booking) => (
                                        <li key={booking.id}>
                                          {format(new Date(booking.booking_date), "EEE, d MMM")} at {booking.start_time.slice(0, 5)} - {booking.profiles?.first_name} {booking.profiles?.last_name}
                                        </li>
                                      ))}
                                      {upcomingBookings.length > 3 && (
                                        <li className="italic">...and {upcomingBookings.length - 3} more</li>
                                      )}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Device settings toggle */}
                            <div className="mt-3 pt-3 border-t">
                              <button
                                type="button"
                                onClick={() => setExpandedBayDevice(isExpanded ? null : bay.id)}
                                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Settings className="h-4 w-4" />
                                <span>Device settings</span>
                                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </button>

                              {isExpanded && (
                                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label htmlFor={`obs-url-${bay.id}`}>OBS WebSocket URL</Label>
                                    <Input
                                      id={`obs-url-${bay.id}`}
                                      value={form.obs_ws_url}
                                      onChange={(e) =>
                                        setBayDeviceForm((prev) => ({
                                          ...prev,
                                          [bay.id]: { ...form, obs_ws_url: e.target.value },
                                        }))
                                      }
                                      placeholder="ws://127.0.0.1:4455"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor={`obs-password-${bay.id}`}>OBS WebSocket Password</Label>
                                    <Input
                                      id={`obs-password-${bay.id}`}
                                      type="password"
                                      value={form.obs_ws_password}
                                      onChange={(e) =>
                                        setBayDeviceForm((prev) => ({
                                          ...prev,
                                          [bay.id]: { ...form, obs_ws_password: e.target.value },
                                        }))
                                      }
                                      placeholder="Paste OBS WebSocket password"
                                    />
                                  </div>
                                  <div className="sm:col-span-2 flex justify-end">
                                    <Button
                                      onClick={() => saveBayDeviceSettings(bay.id)}
                                      disabled={savingBayDevice === bay.id}
                                      size="sm"
                                    >
                                      {savingBayDevice === bay.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      ) : null}
                                      Save Device Settings
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleSection>

            {/* Door Access */}
            <CollapsibleSection
              title="Door Access"
              description="Keypad codes: fixed, daily, or unique per booking"
            >
              <DoorAccessSection />
            </CollapsibleSection>




            {/* Operating Hours */}
            <CollapsibleSection
              title="Operating Hours"
              description="Set business operating hours and staffed hours per day"
            >
              <div className="space-y-4">
                <CollapsibleSection
                  title="Operating Hours"
                  description="When the facility is open for bookings. Affects the timetable and booking availability."
                >
                  <DailyHoursEditor
                    table="operating_hours"
                    toggleField="is_open"
                    startField="open_time"
                    endField="close_time"
                    toggleLabel="Open on"
                    closedLabel="Closed"
                    helperText="Bookings and the admin timetable use these hours. Toggle a day off to close it entirely."
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Staffed Hours"
                  description="When staff are on-site. Used for automated email and SMS notifications."
                >
                  <DailyHoursEditor
                    table="staffed_hours"
                    toggleField="is_staffed"
                    startField="start_time"
                    endField="end_time"
                    toggleLabel="Staffed on"
                    closedLabel="Unstaffed"
                    helperText="Used to trigger automations (e.g. after-hours notifications). Does not affect booking availability."
                  />
                </CollapsibleSection>
              </div>
            </CollapsibleSection>
          </TabsContent>

          {/* Reporting Section */}
          <TabsContent value="reporting" className="space-y-4">
            <SalesReporting />
          </TabsContent>

          {/* Pricing Settings */}
          <TabsContent value="pricing" className="space-y-4">
            <CollapsibleSection
              title="Pricing"
              description="Membership weekly fees, member hourly rates and casual peak / off-peak rates"
              icon={DollarSign}
            >
              <PricingRatesSettings />
            </CollapsibleSection>

            <CollapsibleSection
              title="Prepaid Packs"
              description="Prepaid hour packs customers can buy or gift (separate to $ credit)"
              icon={Gift}
            >
              <PackProductsSettings />
            </CollapsibleSection>

            <CollapsibleSection
              title="Corporate Packs"
              description="Hour packs only corporate accounts can buy and share with their staff"
              icon={Building2}
            >
              <PackProductsSettings isCorporate />
            </CollapsibleSection>

            <CollapsibleSection title="Public Holidays" description="Manage public holiday dates for peak pricing">
              <PublicHolidaysSection />
            </CollapsibleSection>


            <CollapsibleSection title="Customer Overrides" description="Set custom hourly rates for specific customers (overrides tier pricing)">
              <Card>
                <CardContent className="space-y-4 pt-6">
                  {customersWithPricing.length > 0 && (
                    <div className="space-y-2">
                      <Label>Customers with Custom Rates</Label>
                      <div className="space-y-2">
                        {customersWithPricing.map((customer) => (
                          <div key={customer.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <span className="font-medium">{customer.first_name} {customer.last_name}</span>
                              <Badge className="ml-2 text-xs" variant="secondary">{customer.membership_tier}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-primary">${customer.custom_hourly_rate}/hr</span>
                              <Button variant="ghost" size="icon" onClick={() => removeCustomRate(customer)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Set Custom Rate for Customer</Label>
                    <Input
                      placeholder="Search customers..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                    />
                    {customerSearch && (
                      <div className="max-h-40 overflow-y-auto border rounded-md">
                        {filteredCustomers.slice(0, 10).map((customer) => (
                          <button
                            key={customer.id}
                            onClick={() => {
                              setSelectedPricingCustomer(customer);
                              setNewCustomRate(customer.custom_hourly_rate?.toString() || "");
                              setCustomerSearch("");
                            }}
                            className="w-full p-2 text-left text-sm hover:bg-muted/50 flex items-center justify-between border-b last:border-b-0"
                          >
                            <span>{customer.first_name} {customer.last_name}</span>
                            <Badge variant="outline" className="text-xs">{customer.membership_tier}</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedPricingCustomer && (
                    <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{selectedPricingCustomer.first_name} {selectedPricingCustomer.last_name}</span>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedPricingCustomer(null)}>Cancel</Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Custom hourly rate"
                          value={newCustomRate}
                          onChange={(e) => setNewCustomRate(e.target.value)}
                          className="flex-1"
                        />
                        <Button onClick={saveCustomRate} disabled={isSavingRate}>
                          {isSavingRate ? "Saving..." : "Save Rate"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Leave empty to remove custom rate and use tier pricing</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleSection>

            <CollapsibleSection
              title="Casual Loyalty Promo"
              description="Reward casual customers with credit after booking milestones"
              icon={Gift}
            >
              <LoyaltyPromoSettings />
            </CollapsibleSection>



          </TabsContent>


          {/* POS Settings */}
          <TabsContent value="pos" className="space-y-4">
            <CollapsibleSection
              title="POS Products"
              description="Manage products available in the POS system. Use arrows to reorder."
              headerAction={
                <Button onClick={(e) => { e.stopPropagation(); openProductDialog(); }} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Product
                </Button>
              }
            >
              <Card>
                <CardContent className="pt-6">
                  {isLoadingProducts ? (
                    <Skeleton className="h-48" />
                  ) : products.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No products yet</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => openProductDialog()}>
                        Add your first product
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {products.map((product, index) => (
                        <ProductRow
                          key={product.id}
                          product={product}
                          onEdit={() => openProductDialog(product)}
                          onToggle={() => toggleProductActive(product)}
                          onDelete={() => deleteProduct(product)}
                          onMoveUp={() => moveProduct(product.id, 'up')}
                          onMoveDown={() => moveProduct(product.id, 'down')}
                          isFirst={index === 0}
                          isLast={index === products.length - 1}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleSection>

            <CollapsibleSection
              title="POS Categories"
              description="Category tiles shown on the POS home screen. Golf includes live peak / off-peak bay hire."
            >
              <POSCategoriesSettings />
            </CollapsibleSection>

            <CollapsibleSection title="Table Service" description="Configure table service hours and settings">

              <TableServiceSettings />
            </CollapsibleSection>
          </TabsContent>

          {/* Notifications Settings */}
          <TabsContent value="notifications" className="space-y-4">
            <CollapsibleSection
              title="Email Header & Footer"
              description="Shared HTML wrapper applied to every customer email. Templates below only hold body content."
            >
              <EmailLayoutEditor />
            </CollapsibleSection>

            <CollapsibleSection title="Email Templates" description="Body content only — the shared header & footer above are applied automatically">
              <Card>
                <CardContent className="space-y-4 pt-6">



                  {isLoadingTemplates ? (
                    <Skeleton className="h-32" />
                  ) : emailTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No templates found.</p>
                  ) : (
                    emailTemplates.map((template) => (
                      <div
                        key={template.id}
                        className={`w-full border rounded-lg p-3 transition-colors ${template.is_active ? 'hover:bg-muted/50' : 'opacity-60 bg-muted/20'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm truncate">{template.name}</h4>
                              {!template.is_active && (
                                <Badge variant="outline" className="text-muted-foreground text-xs">Disabled</Badge>
                              )}
                              {template.html_content ? (
                                <Badge variant="default" className="bg-green-600 text-xs">Custom</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Default</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setPreviewHtml(template.html_content || "<p>No custom template set. Using default template.</p>");
                                setPreviewOpen(true);
                              }}
                              disabled={!template.html_content}
                              className="h-8 w-8"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openTemplateEditor(template)}
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant={template.is_active ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleTemplateActive(template)}
                              className={template.is_active ? "bg-green-600 hover:bg-green-700 h-8" : "h-8"}
                            >
                              {template.is_active ? "On" : "Off"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setTemplateToDelete(template)}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </CollapsibleSection>


            <CollapsibleSection
              title="SMS Templates"
              description="Customize SMS notification templates"
            >
              <SmsTemplatesSection />
            </CollapsibleSection>


          </TabsContent>
        </Tabs>

        {/* Email Template Editor Dialog */}
        <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                {selectedTemplate?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedTemplate?.description}
              </DialogDescription>
            </DialogHeader>
            
            {selectedTemplate && (
              <div className="space-y-4">
                {/* Available Tags Section */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Available Tags</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Click a tag to copy it, then paste into your template HTML
                  </p>
                  <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border">
                    {TEMPLATE_TAGS[selectedTemplate.templateKey]?.map((item) => (
                      <button
                        key={item.tag}
                        onClick={() => copyTag(item.tag)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-background border rounded text-xs font-mono hover:bg-primary/10 hover:border-primary transition-colors group"
                        title={item.description}
                      >
                        {item.tag}
                        {copiedTag === item.tag ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tag Descriptions */}
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Tag Reference</Label>
                  <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/20 rounded-lg border max-h-32 overflow-y-auto">
                    {TEMPLATE_TAGS[selectedTemplate.templateKey]?.map((item) => (
                      <div key={item.tag} className="flex gap-2">
                        <code className="font-mono text-primary">{item.tag}</code>
                        <span>, {item.description}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subject Line */}
                <div className="space-y-2">
                  <Label>Email Subject</Label>
                  <Input
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                    placeholder="e.g. Your Booking Confirmation"
                  />
                </div>

                {/* HTML Editor */}
                <div className="space-y-2">
                  <Label>Template HTML</Label>
                  <Textarea
                    value={templateHtml}
                    onChange={(e) => setTemplateHtml(e.target.value)}
                    placeholder={`<h1>Hi {first_name}!</h1>\n<p>Your booking has been confirmed...</p>`}
                    className="font-mono text-sm min-h-[200px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste your custom HTML email template here. Use the tags above to personalize the message. Leave empty to use the default template.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 justify-between">
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      const match = emailTemplates.find((t) => t.id === selectedTemplate.id);
                      if (match) setTemplateToDelete(match);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                      Cancel
                    </Button>
                    <Button onClick={saveTemplate} disabled={isSavingTemplate}>
                      {isSavingTemplate ? "Saving..." : "Save Template"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Email Template Confirmation */}
        <AlertDialog open={!!templateToDelete} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{templateToDelete?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the template. Any notification using it will fall back to the default content.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => templateToDelete && deleteTemplate(templateToDelete)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        {/* Email Template Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Email Preview</DialogTitle>
            </DialogHeader>
            <EmailPreviewFrame html={previewHtml} />
          </DialogContent>
        </Dialog>

        {/* Product Dialog */}
        <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                {editingProduct ? "Edit Product" : "Add Product"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Beer"
                />
              </div>
              <div className="space-y-2">
                <Label>Price ($) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  placeholder="e.g. 8.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={productFamily}
                  onChange={(e) => setProductFamily(e.target.value)}
                  placeholder="e.g. Drinks"
                  list="families"
                />
                <datalist id="families">
                  {families.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
              <Button
                className="w-full"
                onClick={saveProduct}
                disabled={isSavingProduct}
              >
                {isSavingProduct ? "Saving..." : editingProduct ? "Update Product" : "Add Product"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

function ProductRow({
  product,
  onEdit,
  onToggle,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  product: POSProduct;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 p-3 border rounded-lg ${!product.is_active ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="flex flex-col gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onMoveUp}
            disabled={isFirst}
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onMoveDown}
            disabled={isLast}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-sm break-words">{product.name}</span>
            <span className="text-muted-foreground text-sm">${product.price.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {product.family && (
              <Badge variant="outline" className="text-xs">{product.family}</Badge>
            )}
            {!product.is_active && (
              <Badge variant="secondary" className="text-xs">Disabled</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle}>
          {product.is_active ? "⏸" : "▶"}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Nesting depth for settings sections. Provided automatically so nested
 * sections render as visually subordinate panels without each call site opting in.
 */
const SectionDepthContext = React.createContext(0);

function CollapsibleSection({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  headerAction,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const depth = React.useContext(SectionDepthContext);
  const isNested = depth > 0;
  // Controlled rather than Tailwind `group-data-[state=open]`: a `group`
  // modifier matches ANY ancestor group, so a closed child nested inside an
  // open parent would wrongly render as open.
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <SectionDepthContext.Provider value={depth + 1}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn(
          "overflow-hidden border transition-colors",
          isNested
            ? "rounded-lg border-border/70 bg-muted/20"
            : "rounded-xl border-border bg-card shadow-sm",
          open &&
            (isNested
              ? "border-primary/30 bg-muted/40"
              : "border-primary/40 shadow-md"),
        )}
      >
        {/* headerAction can contain real buttons, so it must be a sibling of
            the trigger rather than nested inside it (no button-in-button). */}
        <div
          className={cn(
            "flex items-stretch gap-2 sm:gap-3 transition-colors hover:bg-muted/50",
            open && "border-b bg-muted/40",
            isNested ? "pr-2 sm:pr-4" : "pr-3 sm:pr-5",
          )}
        >
          {/* Accent rail — fills in when the section is open so the active
              section is obvious at a glance, not just via the chevron. */}
          <span
            aria-hidden
            className={cn(
              "shrink-0 transition-colors",
              open ? "bg-primary" : "bg-border",
              isNested ? "w-0.5" : "w-1",
            )}
          />

          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 sm:gap-3 text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                isNested ? "py-3 pl-1" : "py-4 pl-2",
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "shrink-0 transition-colors",
                    open ? "text-primary" : "text-muted-foreground",
                    isNested ? "h-4 w-4" : "h-5 w-5",
                  )}
                />
              )}

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block font-semibold leading-tight break-words",
                    isNested ? "text-base" : "text-base sm:text-lg",
                  )}
                >
                  {title}
                </span>
                {description && (
                  <span className="mt-0.5 block text-xs sm:text-sm font-normal text-muted-foreground break-words">
                    {description}
                  </span>
                )}
              </span>

              {/* Explicit Show / Hide label: the arrow alone doesn't communicate
                  that the row expands into a sub-section. */}
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                  open
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/60 bg-background text-muted-foreground",
                )}
              >
                <span className="hidden sm:inline">{open ? "Hide" : "Show"}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    open && "rotate-180",
                  )}
                />
              </span>
            </button>
          </CollapsibleTrigger>

          {headerAction && (
            <div className="flex shrink-0 items-center">{headerAction}</div>
          )}
        </div>

        <CollapsibleContent>
          <div
            className={cn(
              // Children frequently pass their own <Card>; flatten those so the
              // section container is the only visible frame.
              "min-w-0 [&>[data-slot=card]]:border-0 [&>[data-slot=card]]:bg-transparent [&>[data-slot=card]]:shadow-none",
              "[&>[data-slot=card]>*]:px-0",
              isNested ? "bg-background/40 px-3 py-3 sm:px-4" : "px-3 py-4 sm:px-5",
            )}
          >
            {children}
          </div>
        </CollapsibleContent>

      </Collapsible>
    </SectionDepthContext.Provider>
  );
}

