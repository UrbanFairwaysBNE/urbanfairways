import { useState, useEffect, useMemo } from "react";
import { usePricing } from "@/hooks/usePricing";
import { tierBadgeClass } from "@/lib/tier-config";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Building2,
  GraduationCap,
  Mail, 
  Phone, 
  User, 
  Calendar,
  Columns,
  Download,
  Upload,
  UserPlus,
  KeyRound,
  DollarSign,
  Trash2,
  X,
  UserX,
  Gift,
  FileText,
  Users,
  Shield,
  Pause,
  Flag
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { Switch } from "@/components/ui/switch";
import { GiftCardsSection } from "@/components/admin/GiftCardsSection";
import { CreditTransactionHistory } from "@/components/admin/CreditTransactionHistory";
import { MembersSection } from "@/components/admin/MembersSection";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

interface Customer {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  membership_tier: string;
  custom_hourly_rate: number | null;
  custom_hourly_rate_peak?: number | null;
  is_coach?: boolean;
  deposit_balance: number;
  created_at: string;
  booking_count?: number;
  custom_billing?: boolean;
  custom_segment?: string | null;
  membership_on_hold?: boolean;
  booking_flag_enabled?: boolean;
}


interface ColumnConfig {
  key: keyof Customer | "full_name";
  label: string;
  visible: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "first_name", label: "First Name", visible: true },
  { key: "last_name", label: "Last Name", visible: true },
  { key: "email", label: "Email", visible: true },
  { key: "phone", label: "Phone", visible: true },
  { key: "membership_tier", label: "Membership", visible: true },
  { key: "booking_count", label: "Bookings", visible: true },
  { key: "deposit_balance", label: "Balance", visible: false },
  { key: "custom_hourly_rate", label: "Custom Rate", visible: false },
  { key: "created_at", label: "Joined", visible: false },
];

export default function AdminCustomers() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const isMobile = useIsMobile();
  const { pricing } = usePricing();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [bookingCountFilter, setBookingCountFilter] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Edit customer state
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);

  // Add customer dialog state
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Deposit dialog state
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [isAddingDeposit, setIsAddingDeposit] = useState(false);

  // Bulk actions state
  const [showBulkDepositDialog, setShowBulkDepositDialog] = useState(false);
  const [bulkDepositAmount, setBulkDepositAmount] = useState("");
  const [isAddingBulkDeposit, setIsAddingBulkDeposit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cancel membership state
  const [showCancelMembershipConfirm, setShowCancelMembershipConfirm] = useState(false);
  const [sendCancellationEmail, setSendCancellationEmail] = useState(true);
  const [isCancellingMembership, setIsCancellingMembership] = useState(false);

  // Make admin state
  const [isTogglingAdmin, setIsTogglingAdmin] = useState(false);
  const [corporateMap, setCorporateMap] = useState<Record<string, { company: string; role: "owner" | "staff" }>>({});
  const [corporateCustomer, setCorporateCustomer] = useState<Customer | null>(null);

  const [corporateName, setCorporateName] = useState("");
  const [isSavingCorporate, setIsSavingCorporate] = useState(false);

  // Remove corporate account state
  const [removeCorpCustomer, setRemoveCorpCustomer] = useState<Customer | null>(null);
  const [removeCorpHours, setRemoveCorpHours] = useState(0);
  const [isRemovingCorporate, setIsRemovingCorporate] = useState(false);
  const [togglingCoachId, setTogglingCoachId] = useState<string | null>(null);

  // Custom billing state
  const [isTogglingCustomBilling, setIsTogglingCustomBilling] = useState(false);
  
  // Hold membership state
  const [isTogglingHold, setIsTogglingHold] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState("customers");

  // Check for user query param to auto-select customer
  const highlightedUserId = searchParams.get("user");

  useEffect(() => {
    if (isAdmin) {
      fetchCustomers();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (highlightedUserId && customers.length > 0) {
      const customer = customers.find(c => c.user_id === highlightedUserId);
      if (customer) {
        setSelectedCustomer(customer);
      }
    }
  }, [highlightedUserId, customers]);

  const fetchCustomers = async () => {
    setIsLoading(true);
    
    // Fetch all profiles using paginated batching to bypass 1000-row limit
    let allProfiles: any[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("last_name")
        .range(from, from + batchSize - 1);

      if (error || !data) {
        setIsLoading(false);
        return;
      }

      allProfiles = [...allProfiles, ...data];
      hasMore = data.length === batchSize;
      from += batchSize;
    }

    // Map total_bookings to booking_count for display
    const customersWithCounts = allProfiles.map((p: any) => ({
      ...p,
      booking_count: p.total_bookings || 0,
    }));

    setCustomers(customersWithCounts);
    setTotalCount(customersWithCounts.length);

    // Corporate owners + linked staff, for the "Corporate" indicator
    const [{ data: accounts }, { data: staff }] = await Promise.all([
      supabase.from("corporate_accounts").select("id, company_name, owner_user_id, is_active"),
      supabase.from("corporate_staff").select("corporate_id, user_id, status"),
    ]);
    const map: Record<string, { company: string; role: "owner" | "staff" }> = {};
    const byId: Record<string, string> = {};
    (accounts || []).forEach((a: any) => {
      byId[a.id] = a.company_name;
      if (a.is_active !== false) map[a.owner_user_id] = { company: a.company_name, role: "owner" };
    });
    (staff || []).forEach((s: any) => {
      if (s.user_id && s.status === "active" && byId[s.corporate_id] && !map[s.user_id]) {
        map[s.user_id] = { company: byId[s.corporate_id], role: "staff" };
      }
    });
    setCorporateMap(map);

    setIsLoading(false);
  };


  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      // Search filter, tokenized so "paul gale" matches first+last across columns
      if (searchQuery && searchQuery.trim()) {
        const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.toLowerCase();
        const fields = [
          fullName,
          (customer.first_name || '').toLowerCase(),
          (customer.last_name || '').toLowerCase(),
          (customer.email || '').toLowerCase(),
          (customer.phone || '').toLowerCase(),
        ];
        const allMatch = tokens.every(t => fields.some(f => f.includes(t)));
        if (!allMatch) return false;
      }

      // Tier filter
      if (tierFilter && customer.membership_tier !== tierFilter) {
        return false;
      }

      // Booking count filter
      if (bookingCountFilter) {
        const count = customer.booking_count || 0;
        switch (bookingCountFilter) {
          case "0":
            if (count !== 0) return false;
            break;
          case "1-5":
            if (count < 1 || count > 5) return false;
            break;
          case "6-10":
            if (count < 6 || count > 10) return false;
            break;
          case "10+":
            if (count <= 10) return false;
            break;
        }
      }

      return true;
    });
  }, [customers, searchQuery, tierFilter, bookingCountFilter]);

  const toggleCustomerSelection = (customerId: string) => {
    const newSelection = new Set(selectedCustomers);
    if (newSelection.has(customerId)) {
      newSelection.delete(customerId);
    } else {
      newSelection.add(customerId);
    }
    setSelectedCustomers(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedCustomers.size === filteredCustomers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(filteredCustomers.map(c => c.id)));
    }
  };

  const toggleColumn = (key: string) => {
    setColumns(cols => cols.map(col => 
      col.key === key ? { ...col, visible: !col.visible } : col
    ));
  };

  const getMembershipColor = (tier: string) => tierBadgeClass(pricing, tier);

  const resetAddCustomerForm = () => {
    setNewFirstName("");
    setNewLastName("");
    setNewEmail("");
    setNewPhone("");
  };

  const createNewCustomer = async () => {
    if (!newFirstName || !newLastName || !newEmail) {
      toast({
        title: "Missing information",
        description: "Please fill in first name, last name, and email.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsCreatingCustomer(true);

    try {
      // Use edge function to create customer (doesn't affect admin's session)
      const { data, error } = await supabase.functions.invoke("create-customer", {
        body: {
          email: newEmail,
          firstName: newFirstName,
          lastName: newLastName,
          phone: newPhone || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Customer created",
        description: `${newFirstName} ${newLastName} has been added successfully.`,
        duration: 4000,
      });
      
      setShowAddCustomerDialog(false);
      resetAddCustomerForm();
      
      // Wait a moment for the profile trigger to create the profile
      setTimeout(() => {
        fetchCustomers();
      }, 1000);
    } catch (error: any) {
      toast({
        title: "Error creating customer",
        description: error.message || "Failed to create customer.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsCreatingCustomer(false);
  };

  const sendPasswordReset = async (customer: Customer) => {
    setIsSendingReset(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("send-password-reset", {
        body: {
          email: customer.email,
          firstName: customer.first_name,
          redirectUrl: `${window.location.origin}/reset-password`,
        },
      });

      if (error) throw error;

      toast({
        title: "Password reset email sent",
        description: `${customer.first_name} will receive an email to set their password.`,
        duration: 4000,
      });
    } catch (error: any) {
      toast({
        title: "Error sending reset email",
        description: error.message || "Failed to send password reset email.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsSendingReset(false);
  };

  const addDeposit = async () => {
    if (!selectedCustomer) return;
    
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid positive amount.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsAddingDeposit(true);

    try {
      const balanceBefore = selectedCustomer.deposit_balance || 0;
      const newBalance = balanceBefore + amount;
      
      const { error } = await supabase
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("id", selectedCustomer.id);

      if (error) throw error;

      // Log the transaction
      await supabase.from("deposit_transactions").insert({
        user_id: selectedCustomer.user_id,
        amount: amount,
        balance_before: balanceBefore,
        balance_after: newBalance,
        transaction_type: "credit",
        description: `Manual credit added by admin`,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });

      // Send notification
      try {
        await supabase.functions.invoke("send-deposit-notification", {
          body: {
            user_id: selectedCustomer.user_id,
            amount: amount,
            new_balance: newBalance,
          },
        });
      } catch (notificationError) {
        console.error("Failed to send deposit notification:", notificationError);
      }

      toast({
        title: "Deposit added",
        description: `$${amount.toFixed(2)} added to ${selectedCustomer.first_name}'s account.`,
        duration: 4000,
      });

      // Update local state
      setCustomers(prev =>
        prev.map(c =>
          c.id === selectedCustomer.id
            ? { ...c, deposit_balance: newBalance }
            : c
        )
      );
      
      setSelectedCustomer({
        ...selectedCustomer,
        deposit_balance: newBalance,
      });
      
      setShowDepositDialog(false);
      setDepositAmount("");
    } catch (error: any) {
      toast({
        title: "Error adding deposit",
        description: error.message || "Failed to add deposit.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsAddingDeposit(false);
  };

  // Bulk add credit to selected customers
  const addBulkDeposit = async () => {
    const amount = parseFloat(bulkDepositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid positive amount.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsAddingBulkDeposit(true);
    const selectedCustomersList = customers.filter(c => selectedCustomers.has(c.id));
    let successCount = 0;

    const adminUserId = (await supabase.auth.getUser()).data.user?.id;
    
    for (const customer of selectedCustomersList) {
      try {
        const balanceBefore = customer.deposit_balance || 0;
        const newBalance = balanceBefore + amount;
        
        const { error } = await supabase
          .from("profiles")
          .update({ deposit_balance: newBalance })
          .eq("id", customer.id);

        if (error) throw error;

        // Log the transaction
        try {
          await supabase.from("deposit_transactions").insert({
            user_id: customer.user_id,
            amount: amount,
            balance_before: balanceBefore,
            balance_after: newBalance,
            transaction_type: "credit",
            description: `Bulk credit added by admin`,
            created_by: adminUserId,
          });
        } catch (e) { console.error("Failed to log transaction:", e); }

        // Send notification (don't await, let it run in background)
        supabase.functions.invoke("send-deposit-notification", {
          body: {
            user_id: customer.user_id,
            amount: amount,
            new_balance: newBalance,
          },
        }).catch(console.error);

        successCount++;
      } catch (error) {
        console.error(`Failed to add deposit for ${customer.email}:`, error);
      }
    }

    toast({
      title: "Credit added",
      description: `$${amount.toFixed(2)} added to ${successCount} customer${successCount !== 1 ? "s" : ""}.`,
      duration: 4000,
    });

    setShowBulkDepositDialog(false);
    setBulkDepositAmount("");
    setSelectedCustomers(new Set());
    fetchCustomers();
    setIsAddingBulkDeposit(false);
  };

  // Delete selected customers
  const deleteSelectedCustomers = async () => {
    setIsDeleting(true);
    const selectedCustomersList = customers.filter(c => selectedCustomers.has(c.id));
    let successCount = 0;

    for (const customer of selectedCustomersList) {
      try {
        // Delete user via edge function (deletes from auth.users, profile cascades)
        const { data, error } = await supabase.functions.invoke("delete-customer", {
          body: { user_id: customer.user_id },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        
        successCount++;
      } catch (error) {
        console.error(`Failed to delete ${customer.email}:`, error);
      }
    }

    toast({
      title: "Customers deleted",
      description: `${successCount} customer${successCount !== 1 ? "s" : ""} deleted.`,
      duration: 4000,
    });

    setShowDeleteConfirm(false);
    setSelectedCustomers(new Set());
    fetchCustomers();
    setIsDeleting(false);
  };

  /** Toggle a customer's coach status. Coaches can book lessons for clients. */
  const toggleCoach = async (customer: Customer) => {
    setTogglingCoachId(customer.user_id);
    const next = !customer.is_coach;
    const { error } = await supabase
      .from("profiles")
      .update({ is_coach: next } as any)
      .eq("user_id", customer.user_id);

    if (error) {
      toast({ title: "Could not update coach status", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: next ? "Coach added" : "Coach removed",
        description: `${customer.first_name} ${customer.last_name} ${next ? "can now book lessons for clients." : "is no longer a coach."}`,
      });
      setCustomers((prev) =>
        prev.map((c) => (c.user_id === customer.user_id ? { ...c, is_coach: next } : c)),
      );
    }
    setTogglingCoachId(null);
  };

  // Toggle admin role for a customer
  /** Promote a customer to a corporate account owner (or rename their company). */
  const saveCorporateAccount = async () => {
    if (!corporateCustomer) return;
    const name = corporateName.trim();
    if (!name) {
      toast({ title: "Enter a company name", variant: "destructive" });
      return;
    }
    setIsSavingCorporate(true);
    try {
      const { data: existing } = await supabase
        .from("corporate_accounts")
        .select("id")
        .eq("owner_user_id", corporateCustomer.user_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("corporate_accounts")
          .update({ company_name: name, is_active: true })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("corporate_accounts")
          .insert({ owner_user_id: corporateCustomer.user_id, company_name: name });
        if (error) throw error;
      }

      toast({
        title: "Corporate account saved",
        description: `${corporateCustomer.first_name} ${corporateCustomer.last_name} now manages ${name}.`,
        duration: 4000,
      });
      setCorporateCustomer(null);
      setCorporateName("");
      fetchCustomers();
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSavingCorporate(false);
    }
  };

  /** Open the remove-corporate confirmation, checking for unused prepaid hours first. */
  const openRemoveCorporate = async (customer: Customer) => {
    setRemoveCorpCustomer(customer);
    setRemoveCorpHours(0);
    const { data } = await supabase
      .from("pack_lots")
      .select("hours_remaining")
      .eq("user_id", customer.user_id)
      .eq("status", "active");
    const hours = (data || []).reduce((sum: number, l: any) => sum + Number(l.hours_remaining || 0), 0);
    setRemoveCorpHours(hours);
  };

  /** Demote a corporate owner: revoke staff links, deactivate the account, void unused hours. */
  const confirmRemoveCorporate = async () => {
    if (!removeCorpCustomer) return;
    setIsRemovingCorporate(true);
    try {
      const { data: accounts, error: accErr } = await supabase
        .from("corporate_accounts")
        .select("id")
        .eq("owner_user_id", removeCorpCustomer.user_id);
      if (accErr) throw accErr;

      const ids = (accounts || []).map((a: any) => a.id);
      if (ids.length > 0) {
        const { error: staffErr } = await supabase
          .from("corporate_staff")
          .update({ status: "revoked", user_id: null })
          .in("corporate_id", ids);
        if (staffErr) throw staffErr;

        const { error: deactErr } = await supabase
          .from("corporate_accounts")
          .update({ is_active: false })
          .in("id", ids);
        if (deactErr) throw deactErr;
      }

      if (removeCorpHours > 0) {
        const { error: lotErr } = await supabase
          .from("pack_lots")
          .update({ status: "expired", hours_remaining: 0 })
          .eq("user_id", removeCorpCustomer.user_id)
          .eq("status", "active");
        if (lotErr) throw lotErr;
      }

      toast({
        title: "Corporate account removed",
        description: `${removeCorpCustomer.first_name} ${removeCorpCustomer.last_name} is now a standard customer.`,
        duration: 4000,
      });
      setRemoveCorpCustomer(null);
      fetchCustomers();
    } catch (e) {
      toast({
        title: "Could not remove",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsRemovingCorporate(false);
    }
  };



  const toggleAdminRole = async (customer: Customer) => {
    setIsTogglingAdmin(true);
    
    try {
      // Check if user already has admin role
      const { data: existingRole, error: checkError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", customer.user_id)
        .eq("role", "admin")
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingRole) {
        // User is already admin, remove the role
        const { error: deleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("id", existingRole.id);

        if (deleteError) throw deleteError;

        toast({
          title: "Admin role removed",
          description: `${customer.first_name} ${customer.last_name} is no longer an admin.`,
          duration: 4000,
        });
      } else {
        // User is not admin, add the role
        const { error: insertError } = await supabase
          .from("user_roles")
          .insert({
            user_id: customer.user_id,
            role: "admin"
          });

        if (insertError) throw insertError;

        toast({
          title: "Admin role granted",
          description: `${customer.first_name} ${customer.last_name} is now an admin.`,
          duration: 4000,
        });
      }
    } catch (error: any) {
      console.error("Error toggling admin role:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update admin role.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsTogglingAdmin(false);
  };

  // Toggle custom billing for a customer (optimistic)
  const toggleCustomBilling = async (customer: Customer) => {
    const newValue = !customer.custom_billing;

    // Optimistic UI update, flip immediately
    setCustomers(prev =>
      prev.map(c => (c.id === customer.id ? { ...c, custom_billing: newValue } : c))
    );
    if (selectedCustomer?.id === customer.id) {
      setSelectedCustomer({ ...selectedCustomer, custom_billing: newValue });
    }

    setIsTogglingCustomBilling(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ custom_billing: newValue })
        .eq("id", customer.id);

      if (error) throw error;

      toast({
        title: newValue ? "Custom billing enabled" : "Custom billing disabled",
        description: newValue
          ? `${customer.first_name}'s tier will not be changed by Stripe webhooks.`
          : `${customer.first_name} will now follow standard billing rules.`,
        duration: 4000,
      });
    } catch (error: any) {
      console.error("Error toggling custom billing:", error);
      // Revert on failure
      setCustomers(prev =>
        prev.map(c => (c.id === customer.id ? { ...c, custom_billing: !newValue } : c))
      );
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer({ ...selectedCustomer, custom_billing: !newValue });
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update custom billing.",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setIsTogglingCustomBilling(false);
    }
  };

  // Toggle staff segment for a customer (optimistic)
  const toggleStaffSegment = async (customer: Customer) => {
    const previousSegment = customer.custom_segment;
    const isStaff = previousSegment === "staff";
    const newSegment = isStaff ? null : "staff";

    // Optimistic UI update
    setCustomers(prev =>
      prev.map(c => (c.id === customer.id ? { ...c, custom_segment: newSegment } : c))
    );
    if (selectedCustomer?.id === customer.id) {
      setSelectedCustomer({ ...selectedCustomer, custom_segment: newSegment });
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ custom_segment: newSegment })
        .eq("id", customer.id);

      if (error) throw error;

      toast({
        title: isStaff ? "Staff access removed" : "Staff access granted",
        description: isStaff
          ? `${customer.first_name} no longer has free off-peak play.`
          : `${customer.first_name} now gets free play during off-peak hours.`,
        duration: 4000,
      });
    } catch (error: any) {
      console.error("Error toggling staff segment:", error);
      // Revert
      setCustomers(prev =>
        prev.map(c => (c.id === customer.id ? { ...c, custom_segment: previousSegment } : c))
      );
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer({ ...selectedCustomer, custom_segment: previousSegment });
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Toggle membership hold for a customer (optimistic)
  const toggleBookingFlag = async (customer: Customer) => {
    const newValue = !customer.booking_flag_enabled;
    setCustomers(prev =>
      prev.map(c => (c.id === customer.id ? { ...c, booking_flag_enabled: newValue } : c))
    );
    if (selectedCustomer?.id === customer.id) {
      setSelectedCustomer({ ...selectedCustomer, booking_flag_enabled: newValue });
    }
    const { error } = await supabase
      .from("profiles")
      .update({ booking_flag_enabled: newValue })
      .eq("id", customer.id);
    if (error) {
      setCustomers(prev =>
        prev.map(c => (c.id === customer.id ? { ...c, booking_flag_enabled: !newValue } : c))
      );
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer({ ...selectedCustomer, booking_flag_enabled: !newValue });
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: newValue ? "Booking flag enabled" : "Booking flag disabled",
      description: newValue
        ? `Admin will be emailed whenever ${customer.first_name} makes a booking.`
        : `Booking alerts for ${customer.first_name} are off.`,
      duration: 3500,
    });
  };

  const toggleMembershipHold = async (customer: Customer) => {

    const newValue = !customer.membership_on_hold;

    // Optimistic UI update, flip the switch immediately
    setCustomers(prev =>
      prev.map(c => (c.id === customer.id ? { ...c, membership_on_hold: newValue } : c))
    );
    if (selectedCustomer?.id === customer.id) {
      setSelectedCustomer({ ...selectedCustomer, membership_on_hold: newValue });
    }

    setIsTogglingHold(true);

    try {
      // Update the database first (fast)
      const { error } = await supabase
        .from("profiles")
        .update({ membership_on_hold: newValue })
        .eq("id", customer.id);

      if (error) throw error;

      // Fire-and-forget the slow Stripe pause/resume + email so the UI feels instant
      supabase.functions
        .invoke("toggle-membership-hold", {
          body: {
            user_id: customer.user_id,
            email: customer.email,
            put_on_hold: newValue,
          },
        })
        .then(({ data, error: stripeError }) => {
          if (stripeError) {
            console.error("Stripe pause/resume error:", stripeError);
            toast({
              title: "Stripe sync warning",
              description: "Database updated, but Stripe billing may not have synced.",
              variant: "destructive",
              duration: 5000,
            });
          } else {
            console.log("Stripe subscription update:", data);
          }
        })
        .catch((err) => console.error("Failed to toggle Stripe subscription:", err));

      if (newValue) {
        supabase.functions
          .invoke("send-membership-hold-email", {
            body: {
              user_id: customer.user_id,
              email: customer.email,
              first_name: customer.first_name,
            },
          })
          .catch((emailError) => {
            console.error("Failed to send membership hold email:", emailError);
          });
      }

      toast({
        title: newValue ? "Membership on hold" : "Membership reactivated",
        description: newValue
          ? `${customer.first_name}'s membership is now on hold. Stripe billing pausing…`
          : `${customer.first_name}'s membership has been reactivated. Stripe billing resuming…`,
        duration: 4000,
      });
    } catch (error: any) {
      console.error("Error toggling membership hold:", error);
      // Revert
      setCustomers(prev =>
        prev.map(c =>
          c.id === customer.id ? { ...c, membership_on_hold: !newValue } : c
        )
      );
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer({ ...selectedCustomer, membership_on_hold: !newValue });
      }
      toast({
        title: "Error",
        description: "Failed to update membership hold status.",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setIsTogglingHold(false);
    }
  };

  // Navigate to bulk email page
  const goToBulkEmail = () => {
    const selectedCustomersList = customers.filter(c => selectedCustomers.has(c.id));
    navigate("/admin/bulk-email", { state: { customers: selectedCustomersList } });
  };

  const openEditMode = (customer: Customer) => {
    setEditFirstName(customer.first_name);
    setEditLastName(customer.last_name);
    setEditEmail(customer.email);
    setEditPhone(customer.phone || "");
    setIsEditMode(true);
  };

  const closeEditMode = () => {
    setIsEditMode(false);
    setEditFirstName("");
    setEditLastName("");
    setEditEmail("");
    setEditPhone("");
  };

  const updateCustomer = async () => {
    if (!selectedCustomer) return;
    
    if (!editFirstName || !editLastName || !editEmail) {
      toast({
        title: "Missing information",
        description: "Please fill in first name, last name, and email.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsUpdatingCustomer(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editFirstName,
          last_name: editLastName,
          email: editEmail,
          phone: editPhone || null,
        })
        .eq("id", selectedCustomer.id);

      if (error) throw error;

      toast({
        title: "Customer updated",
        description: `${editFirstName} ${editLastName} has been updated.`,
        duration: 4000,
      });

      // Update local state
      setCustomers(prev =>
        prev.map(c =>
          c.id === selectedCustomer.id
            ? { ...c, first_name: editFirstName, last_name: editLastName, email: editEmail, phone: editPhone || null }
            : c
        )
      );
      
      setSelectedCustomer({
        ...selectedCustomer,
        first_name: editFirstName,
        last_name: editLastName,
        email: editEmail,
        phone: editPhone || null,
      });
      
      closeEditMode();
    } catch (error: any) {
      toast({
        title: "Error updating customer",
        description: error.message || "Failed to update customer.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsUpdatingCustomer(false);
  };

  const cancelMembership = async () => {
    if (!selectedCustomer) return;
    
    setIsCancellingMembership(true);

    try {
      const { data, error } = await supabase.functions.invoke("cancel-membership", {
        body: {
          user_id: selectedCustomer.user_id,
          send_notification: sendCancellationEmail,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Membership cancelled",
        description: `${selectedCustomer.first_name}'s membership has been cancelled.`,
        duration: 4000,
      });

      // Update local state
      setCustomers(prev =>
        prev.map(c =>
          c.id === selectedCustomer.id
            ? { ...c, membership_tier: "casual" }
            : c
        )
      );
      
      setSelectedCustomer({
        ...selectedCustomer,
        membership_tier: "casual",
      });
      
      setShowCancelMembershipConfirm(false);
    } catch (error: any) {
      toast({
        title: "Error cancelling membership",
        description: error.message || "Failed to cancel membership.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsCancellingMembership(false);
  };

  const visibleColumns = columns.filter(c => c.visible);

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[600px]" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl lg:text-3xl uppercase tracking-wide text-foreground">
              Customers
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {totalCount.toLocaleString()} total customers
            </p>
          </div>

          {activeTab === "customers" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/customer-import')}>
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
              <Button onClick={() => setShowAddCustomerDialog(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="customers" className="gap-2">
              <Users className="h-4 w-4" />
              Customers
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Shield className="h-4 w-4" />
              Members
            </TabsTrigger>
            <TabsTrigger value="gift-cards" className="gap-2">
              <Gift className="h-4 w-4" />
              Gift Cards
            </TabsTrigger>
          </TabsList>

          <TabsContent value="customers" className="space-y-4 mt-4">

        {/* Bulk Actions */}
        {selectedCustomers.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-primary/5 px-4 py-3 rounded-lg border border-primary/20">
            <span className="text-sm font-medium">
              {selectedCustomers.size} selected
            </span>
            <div className="h-4 w-px bg-border mx-1 hidden sm:block" />
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
              <Button variant="outline" size="sm" onClick={goToBulkEmail}>
                <Mail className="h-4 w-4 mr-1" />
                Email
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setBulkDepositAmount("");
                  setShowBulkDepositDialog(true);
                }}
              >
                <DollarSign className="h-4 w-4 mr-1" />
                Add Credit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCustomers(new Set())}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Filters and Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Tier Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                {tierFilter || "All Tiers"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setTierFilter(null)}>
                All Tiers
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {pricing.map((t) => (
                <DropdownMenuItem key={t.tier} onClick={() => setTierFilter(t.tier)}>
                  {t.display_name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Booking Count Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4 mr-2" />
                {bookingCountFilter === "0" ? "0 Bookings" : 
                 bookingCountFilter ? `${bookingCountFilter} Bookings` : "All Bookings"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setBookingCountFilter(null)}>
                All Bookings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setBookingCountFilter("0")}>
                0 Bookings (Never played)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBookingCountFilter("1-5")}>
                1-5 Bookings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBookingCountFilter("6-10")}>
                6-10 Bookings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBookingCountFilter("10+")}>
                10+ Bookings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Column Visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns className="h-4 w-4 mr-2" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {columns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={col.visible}
                  onCheckedChange={() => toggleColumn(col.key)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-[400px]" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedCustomers.size === filteredCustomers.length && filteredCustomers.length > 0}
                      onCheckedChange={toggleAllSelection}
                    />
                  </TableHead>
                  {visibleColumns.map((col) => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + 2} className="text-center py-8 text-muted-foreground">
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id}
                      className={`hover:bg-muted/50 cursor-pointer ${
                        customer.user_id === highlightedUserId ? "bg-primary/5" : ""
                      }`}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedCustomers.has(customer.id)}
                          onCheckedChange={() => toggleCustomerSelection(customer.id)}
                        />
                      </TableCell>
                      {visibleColumns.map((col) => (
                        <TableCell key={col.key}>
                          {col.key === "membership_tier" ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge className={getMembershipColor(customer.membership_tier)}>
                                {customer.membership_tier || "Casual"}
                              </Badge>
                              {corporateMap[customer.user_id] && (
                                <Badge variant="outline" className="border-brand-accent text-brand-accent">
                                  {corporateMap[customer.user_id].role === "owner" ? "Corporate" : "Corp staff"} · {corporateMap[customer.user_id].company}
                                </Badge>
                              )}
                            </div>

                          ) : col.key === "created_at" ? (
                            format(new Date(customer.created_at), "MMM d, yyyy")
                          ) : col.key === "phone" ? (
                            customer.phone || "-"
                          ) : col.key === "custom_hourly_rate" ? (
                            customer.custom_hourly_rate ? `$${customer.custom_hourly_rate}/hr` : "-"
                          ) : col.key === "deposit_balance" ? (
                            customer.deposit_balance > 0 ? `$${Number(customer.deposit_balance).toFixed(2)}` : "-"
                          ) : col.key === "booking_count" ? (
                            <span className={customer.booking_count === 0 ? "text-muted-foreground" : ""}>
                              {customer.booking_count || 0}
                            </span>
                          ) : (
                            customer[col.key as keyof Customer]
                          )}
                        </TableCell>
                      ))}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedCustomer(customer)}>
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem>Edit Customer</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => sendPasswordReset(customer)}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              Send Password Reset
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Mail className="h-4 w-4 mr-2" />
                              Send Email
                            </DropdownMenuItem>
                            {customer.phone && (
                              <DropdownMenuItem>
                                <Phone className="h-4 w-4 mr-2" />
                                Call
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => toggleAdminRole(customer)}
                              disabled={isTogglingAdmin}
                            >
                              <Shield className="h-4 w-4 mr-2" />
                              Make Admin
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => toggleCoach(customer)}
                              disabled={togglingCoachId === customer.user_id}
                            >
                              <GraduationCap className="h-4 w-4 mr-2" />
                              {customer.is_coach ? "Remove Coach" : "Make Coach"}
                            </DropdownMenuItem>
                            {corporateMap[customer.user_id]?.role === "owner" ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => openRemoveCorporate(customer)}
                              >
                                <Building2 className="h-4 w-4 mr-2" />
                                Remove Corporate Account
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => {
                                  setCorporateCustomer(customer);
                                  setCorporateName("");
                                }}
                              >
                                <Building2 className="h-4 w-4 mr-2" />
                                Make Corporate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Remove Corporate Dialog */}
        <Dialog
          open={!!removeCorpCustomer}
          onOpenChange={(o) => !o && setRemoveCorpCustomer(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove corporate account</DialogTitle>
              <DialogDescription>
                {removeCorpCustomer
                  ? `${removeCorpCustomer.first_name} ${removeCorpCustomer.last_name} will become a standard customer and every staff member linked to their company will lose access to the shared wallet.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            {removeCorpHours > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                This company still has <strong>{removeCorpHours} unused prepaid hour{removeCorpHours === 1 ? "" : "s"}</strong>.
                Continuing will delete those credits permanently.
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRemoveCorpCustomer(null)}
                disabled={isRemovingCorporate}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRemoveCorporate}
                disabled={isRemovingCorporate}
              >
                {isRemovingCorporate
                  ? "Removing..."
                  : removeCorpHours > 0
                    ? "Remove & delete credits"
                    : "Remove corporate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Make Corporate Dialog */}
        <Dialog
          open={!!corporateCustomer}
          onOpenChange={(o) => !o && setCorporateCustomer(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Make corporate account</DialogTitle>
              <DialogDescription>
                {corporateCustomer
                  ? `${corporateCustomer.first_name} ${corporateCustomer.last_name} will manage the company wallet, buy corporate packs and add staff.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="corp-name">Company name</Label>
              <Input
                id="corp-name"
                value={corporateName}
                maxLength={120}
                placeholder="Acme Pty Ltd"
                onChange={(e) => setCorporateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCorporateAccount();
                }}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCorporateCustomer(null)}
                disabled={isSavingCorporate}
              >
                Cancel
              </Button>
              <Button onClick={saveCorporateAccount} disabled={isSavingCorporate}>
                {isSavingCorporate ? "Saving..." : "Make corporate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Customer Details Dialog */}
        <Dialog 
          open={!!selectedCustomer} 
          onOpenChange={(open) => {
            if (!open) {
              setSelectedCustomer(null);
              closeEditMode();
            }
          }}
        >
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                {isEditMode ? "Edit Customer" : "Customer Profile"}
              </DialogTitle>
            </DialogHeader>
            
            {selectedCustomer && !isEditMode && (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-lg truncate">
                      {selectedCustomer.first_name} {selectedCustomer.last_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge className={getMembershipColor(selectedCustomer.membership_tier)}>
                        {selectedCustomer.membership_tier || "Casual"}
                      </Badge>
                      {corporateMap[selectedCustomer.user_id] && (
                        <Badge variant="outline" className="border-brand-accent text-brand-accent">
                          {corporateMap[selectedCustomer.user_id].role === "owner" ? "Corporate" : "Corp staff"} · {corporateMap[selectedCustomer.user_id].company}
                        </Badge>
                      )}
                    </div>

                  </div>
                  {isMobile ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleBookingFlag(selectedCustomer)}
                      className={selectedCustomer.booking_flag_enabled ? "text-brand-accent hover:text-brand-accent" : "text-muted-foreground"}
                      aria-label="Toggle booking flag"
                      title={selectedCustomer.booking_flag_enabled
                        ? "Booking flag ON — admin is emailed whenever this customer makes a booking. Tap to disable."
                        : "Enable booking flag to email the admin whenever this customer makes a booking."}
                    >
                      <Flag className={`h-5 w-5 ${selectedCustomer.booking_flag_enabled ? "fill-current" : ""}`} />
                    </Button>
                  ) : (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild onFocus={(e) => e.preventDefault()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleBookingFlag(selectedCustomer)}
                          className={selectedCustomer.booking_flag_enabled ? "text-brand-accent hover:text-brand-accent" : "text-muted-foreground"}
                          aria-label="Toggle booking flag"
                        >
                          <Flag className={`h-5 w-5 ${selectedCustomer.booking_flag_enabled ? "fill-current" : ""}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[240px] text-xs">
                        {selectedCustomer.booking_flag_enabled
                          ? "Booking flag ON — admin is emailed whenever this customer makes a booking. Click to disable."
                          : "Enable booking flag to email the admin whenever this customer makes a booking."}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  )}
                </div>



                <hr className="border-border" />

                {/* Contact Info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={`mailto:${selectedCustomer.email}`} className="hover:text-primary truncate">
                      {selectedCustomer.email}
                    </a>
                  </div>
                  
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a href={`tel:${selectedCustomer.phone}`} className="hover:text-primary">
                        {selectedCustomer.phone}
                      </a>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      Joined {format(new Date(selectedCustomer.created_at), "MMMM d, yyyy")}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className={selectedCustomer.booking_count === 0 ? "text-muted-foreground" : ""}>
                      {selectedCustomer.booking_count || 0} booking{selectedCustomer.booking_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <hr className="border-border" />

                {/* Balance Section */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">Credit Balance</div>
                    <div className="text-xl font-semibold text-primary">
                      ${Number(selectedCustomer.deposit_balance || 0).toFixed(2)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDepositAmount("");
                      setShowDepositDialog(true);
                    }}
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Add Credit
                  </Button>
                </div>

                {/* Credit Transaction History */}
                <CreditTransactionHistory userId={selectedCustomer.user_id} />

                <hr className="border-border" />


                {/* Hold Membership Toggle - only show for non-casual customers */}
                {selectedCustomer.membership_tier && selectedCustomer.membership_tier !== "casual" && (
                  <>
                    <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Pause className="h-5 w-5 text-orange-600 shrink-0" />
                        <div>
                          <div className="text-sm font-medium">Hold Membership</div>
                          <div className="text-xs text-muted-foreground">
                            Pause billing and block bookings temporarily
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={selectedCustomer.membership_on_hold || false}
                        onCheckedChange={() => toggleMembershipHold(selectedCustomer)}
                        disabled={isTogglingHold}
                      />
                    </div>

                    <hr className="border-border" />
                  </>
                )}

                <hr className="border-border" />
                {selectedCustomer.membership_tier && selectedCustomer.membership_tier !== "casual" && (
                  <>
                    <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-destructive">Cancel Membership</div>
                          <div className="text-xs text-muted-foreground">
                            Cancel subscription and revert to casual
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/50 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            setSendCancellationEmail(true);
                            setShowCancelMembershipConfirm(true);
                          }}
                        >
                          <UserX className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>

                    <hr className="border-border" />
                  </>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => sendPasswordReset(selectedCustomer)}
                    disabled={isSendingReset}
                  >
                    <KeyRound className="h-4 w-4 mr-2" />
                    {isSendingReset ? "Sending..." : "Reset Password"}
                  </Button>
                  <Button 
                    className="flex-1 bg-primary hover:bg-primary/90"
                    onClick={() => openEditMode(selectedCustomer)}
                  >
                    Edit Profile
                  </Button>
                </div>
              </div>
            )}

            {selectedCustomer && isEditMode && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name *</Label>
                    <Input
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Phone number"
                  />
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={closeEditMode}
                    disabled={isUpdatingCustomer}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={updateCustomer}
                    disabled={isUpdatingCustomer}
                  >
                    {isUpdatingCustomer ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Customer Dialog */}
        <Dialog open={showAddCustomerDialog} onOpenChange={setShowAddCustomerDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                Add Customer
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>
              
              <p className="text-xs text-muted-foreground">
                Customer will be created with casual tier. They will receive an email to set their password.
              </p>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowAddCustomerDialog(false);
                    resetAddCustomerForm();
                  }}
                  disabled={isCreatingCustomer}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={createNewCustomer}
                  disabled={isCreatingCustomer}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {isCreatingCustomer ? "Creating..." : "Add Customer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Deposit Dialog */}
        <Dialog open={showDepositDialog} onOpenChange={setShowDepositDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                Add Credit
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {selectedCustomer && (
                <p className="text-sm text-muted-foreground">
                  Adding credit to {selectedCustomer.first_name} {selectedCustomer.last_name}'s account.
                  Current balance: ${Number(selectedCustomer.deposit_balance || 0).toFixed(2)}
                </p>
              )}
              
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowDepositDialog(false);
                    setDepositAmount("");
                  }}
                  disabled={isAddingDeposit}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={addDeposit}
                  disabled={isAddingDeposit || !depositAmount}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  {isAddingDeposit ? "Adding..." : "Add Credit"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Add Credit Dialog */}
        <Dialog open={showBulkDepositDialog} onOpenChange={setShowBulkDepositDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                Add Credit
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Adding credit to {selectedCustomers.size} customer{selectedCustomers.size !== 1 ? "s" : ""}.
                Each will receive an email notification.
              </p>
              
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bulkDepositAmount}
                  onChange={(e) => setBulkDepositAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowBulkDepositDialog(false);
                    setBulkDepositAmount("");
                  }}
                  disabled={isAddingBulkDeposit}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={addBulkDeposit}
                  disabled={isAddingBulkDeposit || !bulkDepositAmount}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  {isAddingBulkDeposit ? "Adding..." : "Add Credit"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedCustomers.size} customer{selectedCustomers.size !== 1 ? "s" : ""}?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the selected customers and their profile data.
                Booking history will be preserved for records.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteSelectedCustomers}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Cancel Membership Confirmation Dialog */}
        <AlertDialog open={showCancelMembershipConfirm} onOpenChange={setShowCancelMembershipConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel membership?</AlertDialogTitle>
              <AlertDialogDescription>
                This will cancel {selectedCustomer?.first_name}'s Stripe subscription and revert their account to casual status.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={sendCancellationEmail}
                  onCheckedChange={(checked) => setSendCancellationEmail(!!checked)}
                />
                Send cancellation notification email
              </label>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCancellingMembership}>Keep Membership</AlertDialogCancel>
              <AlertDialogAction
                onClick={cancelMembership}
                disabled={isCancellingMembership}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isCancellingMembership ? "Cancelling..." : "Cancel Membership"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <MembersSection />
          </TabsContent>

          <TabsContent value="gift-cards" className="mt-4">
            <GiftCardsSection />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
