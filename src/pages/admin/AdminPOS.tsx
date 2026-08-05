import { useState, useEffect } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Wallet,
  Banknote,
  User,
  Calendar,
  X,
  ChevronLeft,
  Percent,
  Beer,
  Loader2,
  Save,
  DollarSign,
  Clock

} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { format } from "date-fns";
import { useLocation } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerSearchCombobox } from "@/components/admin/CustomerSearchCombobox";

interface POSProduct {
  id: string;
  name: string;
  price: number;
  family: string | null;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  bookingId?: string;
}

interface UnpaidBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_price: number;
  duration_hours?: number;
  hourly_rate?: number;
  bay_name: string;
  customer_name: string;
  customer_id: string;
}

interface Customer {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  deposit_balance?: number;
}

interface BookingDataFromNav {
  bookingId: string;
  customerId: string;
  duration: number;
  customerName: string;
  totalPrice: number;
  bayName: string;
  bookingDate: string;
  startTime: string;
}

interface BayOrderFromNav {
  orderId: string;
  bayNumber: number;
  items: Array<{ name: string; price: number; quantity: number }>;
  total: number;
}

interface LocalCompDataFromNav {
  teamId: string;
  competitionId: string;
  teamName: string;
  entryFee: number;
  compName: string;
  playerNumber?: 1 | 2;
  playerName?: string;
}

export default function AdminPOS() {
  const { isAdmin, isLoading } = useAdminAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [unpaidBookings, setUnpaidBookings] = useState<UnpaidBooking[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<string>("categories");
  const [families, setFamilies] = useState<string[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showBookingsDialog, setShowBookingsDialog] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<UnpaidBooking | null>(null);
  const [packHoursBalance, setPackHoursBalance] = useState(0);
  const [packHoursToApply, setPackHoursToApply] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [processedNavBooking, setProcessedNavBooking] = useState<string | null>(null);
  const [localCompTeamId, setLocalCompTeamId] = useState<string | null>(null);
  const [localCompPlayerNumber, setLocalCompPlayerNumber] = useState<1 | 2 | null>(null);
  const [terminalCountdown, setTerminalCountdown] = useState<number | null>(null);
  const [customerBalance, setCustomerBalance] = useState<number>(0);
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [creditToApply, setCreditToApply] = useState<number>(0);
  
  // Cash payment flow
  const [cashStep, setCashStep] = useState<'input' | 'change' | null>(null);
  const [cashTendered, setCashTendered] = useState<string>("");
  
  // Surcharge state - persisted to localStorage
  const [surchargeEnabled, setSurchargeEnabled] = useState(() => {
    const saved = localStorage.getItem('pos_surcharge_enabled');
    return saved === 'true';
  });
  const [surchargePercent, setSurchargePercent] = useState<string>(() => {
    return localStorage.getItem('pos_surcharge_percent') || "10";
  });

  // Persist surcharge settings when they change
  useEffect(() => {
    localStorage.setItem('pos_surcharge_enabled', String(surchargeEnabled));
  }, [surchargeEnabled]);

  useEffect(() => {
    localStorage.setItem('pos_surcharge_percent', surchargePercent);
  }, [surchargePercent]);

  // Bar tab state
  interface BarTab {
    id: string;
    customer_id: string | null;
    customer_name: string;
    items: CartItem[];
    subtotal: number;
    updated_at: string;
  }
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeTabCustomerName, setActiveTabCustomerName] = useState<string>("");
  const [openTabs, setOpenTabs] = useState<BarTab[]>([]);
  const [showTabsDialog, setShowTabsDialog] = useState(false);
  const [tabSaving, setTabSaving] = useState(false);
  const [showCustomAmountDialog, setShowCustomAmountDialog] = useState(false);
  const [customAmount, setCustomAmount] = useState("");

  useEffect(() => {
    if (isAdmin) {
      fetchProducts();
      fetchUnpaidBookings();
      fetchCustomers();
      fetchOpenTabs();
    }
  }, [isAdmin]);

  // Refresh customer list when Bar Tabs dialog opens so new customers appear
  useEffect(() => {
    if (showTabsDialog && isAdmin) {
      fetchCustomers();
    }
  }, [showTabsDialog, isAdmin]);

  // Handle booking data from navigation (from timetable)
  useEffect(() => {
    const navState = location.state as { bookingData?: BookingDataFromNav; bayOrderData?: BayOrderFromNav; localCompData?: LocalCompDataFromNav } | null;
    
    // Handle booking from timetable
    if (navState?.bookingData && processedNavBooking !== navState.bookingData.bookingId) {
      const bookingData = navState.bookingData;
      
      // Set customer
      setSelectedCustomer(bookingData.customerId);
      
      // Set selected booking for tracking
      setSelectedBooking({
        id: bookingData.bookingId,
        booking_date: bookingData.bookingDate,
        start_time: bookingData.startTime,
        end_time: '',
        total_price: bookingData.totalPrice,
        bay_name: bookingData.bayName,
        customer_name: bookingData.customerName,
        customer_id: bookingData.customerId,
      });
      
      // Add booking as custom cart item with actual calculated price
      setCart([{
        id: `booking-${bookingData.bookingId}`,
        name: `${bookingData.duration}hr Booking: ${bookingData.bayName} - ${format(new Date(bookingData.bookingDate), 'dd/MM')} ${bookingData.startTime.slice(0, 5)}`,
        price: bookingData.totalPrice,
        quantity: 1,
        bookingId: bookingData.bookingId,
      }]);
      
      setProcessedNavBooking(bookingData.bookingId);
      toast.success(`Added ${bookingData.duration}hr booking ($${bookingData.totalPrice}) to cart`);
    }
    
    // Handle bay order from QR code ordering
    if (navState?.bayOrderData && processedNavBooking !== navState.bayOrderData.orderId) {
      const orderData = navState.bayOrderData;
      
      // Add all items from the bay order to cart
      const cartItems: CartItem[] = orderData.items.map((item, idx) => ({
        id: `bay-order-${orderData.orderId}-${idx}`,
        name: `Bay ${orderData.bayNumber}: ${item.name}`,
        price: item.price,
        quantity: item.quantity,
      }));
      
      setCart(cartItems);
      setProcessedNavBooking(orderData.orderId);
      toast.success(`Bay ${orderData.bayNumber} order loaded ($${orderData.total.toFixed(2)})`);
    }

    // Handle local competition entry fee
    if (navState?.localCompData) {
      const compData = navState.localCompData;
      const navKey = `${compData.teamId}-${compData.playerNumber || 'team'}`;
      if (processedNavBooking !== navKey) {
        const playerLabel = compData.playerName ? compData.playerName : compData.teamName;
        const price = compData.entryFee;
        
        setCart([{
          id: `local-comp-${navKey}`,
          name: `${compData.compName}: ${playerLabel} entry fee`,
          price,
          quantity: 1,
        }]);
        
        setLocalCompTeamId(compData.teamId);
        setLocalCompPlayerNumber(compData.playerNumber || null);
        setProcessedNavBooking(navKey);
        toast.success(`${playerLabel} entry fee ($${price}) loaded`);
      }
    }
  }, [location.state, processedNavBooking]);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('pos_products')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching products:', error);
    } else {
      setProducts(data || []);
      const uniqueFamilies = [...new Set(data?.map(p => p.family).filter(Boolean))] as string[];
      setFamilies(uniqueFamilies);
    }
    setLoadingProducts(false);
  };

  const fetchUnpaidBookings = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_date,
        start_time,
        end_time,
        total_price,
        duration_hours,
        hourly_rate,
        user_id,
        bay_id,
        bays(name),
        profiles!bookings_user_id_fkey(first_name, last_name, user_id)
      `)
      .gte('booking_date', today)
      .eq('payment_method', 'pending')
      .neq('status', 'cancelled')
      .order('booking_date', { ascending: true });

    if (error) {
      console.error('Error fetching unpaid bookings:', error);
    } else {
      const bookings = data?.map((b: any) => ({
        id: b.id,
        booking_date: b.booking_date,
        start_time: b.start_time,
        end_time: b.end_time,
        total_price: b.total_price,
        duration_hours: b.duration_hours,
        hourly_rate: b.hourly_rate,

        bay_name: b.bays?.name || 'Unknown',
        customer_name: b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : 'Unknown',
        customer_id: b.profiles?.user_id || b.user_id,
      })) || [];
      setUnpaidBookings(bookings);
    }
  };

  const fetchCustomers = async () => {
    const pageSize = 1000;
    let from = 0;
    let allCustomers: Customer[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email, phone, deposit_balance')
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error('Error fetching customers:', error);
        return;
      }

      allCustomers = [...allCustomers, ...(data || [])];

      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    setCustomers(allCustomers);
  };

  const fetchOpenTabs = async () => {
    const { data, error } = await supabase
      .from('bar_tabs')
      .select('id, customer_id, customer_name, items, subtotal, updated_at')
      .eq('status', 'open')
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('Error fetching open tabs:', error);
      return;
    }
    setOpenTabs((data || []).map((t: any) => ({
      ...t,
      items: Array.isArray(t.items) ? t.items : [],
    })));
  };

  // Auto-save active tab when cart changes (debounced)
  useEffect(() => {
    if (!activeTabId) return;
    const handle = setTimeout(async () => {
      setTabSaving(true);
      const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const { error } = await supabase
        .from('bar_tabs')
        .update({
          items: JSON.parse(JSON.stringify(cart)),
          subtotal,
          customer_id: selectedCustomer || null,
        })
        .eq('id', activeTabId);
      setTabSaving(false);
      if (error) {
        console.error('Error saving tab:', error);
        toast.error('Failed to save tab');
      }
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, activeTabId, selectedCustomer]);

  const startNewTab = async () => {
    if (!selectedCustomer) {
      toast.error('Select a customer first');
      return;
    }
    const customer = customers.find(c => c.user_id === selectedCustomer);
    if (!customer) return;
    const customerName = `${customer.first_name} ${customer.last_name}`.trim();

    const existing = openTabs.find(t => t.customer_id === selectedCustomer);
    if (existing) {
      toast.info(`${customerName} already has an open tab, resuming it`);
      loadTab(existing);
      return;
    }

    const { data, error } = await supabase
      .from('bar_tabs')
      .insert({
        customer_id: selectedCustomer,
        customer_name: customerName,
        items: JSON.parse(JSON.stringify(cart)),
        subtotal: cart.reduce((s, i) => s + i.price * i.quantity, 0),
        status: 'open',
      })
      .select('id, customer_id, customer_name, items, subtotal, updated_at')
      .single();

    if (error || !data) {
      console.error(error);
      toast.error('Failed to start tab');
      return;
    }
    setActiveTabId(data.id);
    setActiveTabCustomerName(customerName);
    fetchOpenTabs();
    setShowTabsDialog(false);
    toast.success(`Tab started for ${customerName}`);
  };

  const loadTab = (tab: BarTab) => {
    setActiveTabId(tab.id);
    setActiveTabCustomerName(tab.customer_name);
    setCart((tab.items as CartItem[]) || []);
    if (tab.customer_id) setSelectedCustomer(tab.customer_id);
    setShowTabsDialog(false);
    toast.success(`Resumed tab for ${tab.customer_name}`);
  };

  const detachTab = () => {
    setActiveTabId(null);
    setActiveTabCustomerName('');
    setCart([]);
    setSelectedBooking(null);
    setSelectedCustomer('');
    setCreditToApply(0);
    fetchOpenTabs();
    toast.info('Tab parked, resume it anytime from Bar Tabs');
  };

  const discardActiveTab = async () => {
    if (!activeTabId) return;
    if (!confirm('Discard this tab? The cart will be cleared and the tab deleted.')) return;
    await supabase.from('bar_tabs').delete().eq('id', activeTabId);
    setActiveTabId(null);
    setActiveTabCustomerName('');
    fetchOpenTabs();
    setCart([]);
    setSelectedBooking(null);
    setSelectedCustomer('');
    setCreditToApply(0);
    toast.info('Tab discarded');
  };
  const saveAndExitTab = async () => {
    if (!activeTabId) return;
    setTabSaving(true);
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await supabase
      .from('bar_tabs')
      .update({
        items: JSON.parse(JSON.stringify(cart)),
        subtotal,
        customer_id: selectedCustomer || null,
      })
      .eq('id', activeTabId);
    setTabSaving(false);
    setActiveTabId(null);
    setActiveTabCustomerName('');
    setCart([]);
    setSelectedBooking(null);
    setSelectedCustomer('');
    setCreditToApply(0);
    fetchOpenTabs();
    toast.success('Tab saved, ready for next order');
  };

  // Update customer balance when customer is selected
  useEffect(() => {
    if (selectedCustomer) {
      const customer = customers.find(c => c.user_id === selectedCustomer);
      setCustomerBalance(customer?.deposit_balance || 0);
    } else {
      setCustomerBalance(0);
    }
  }, [selectedCustomer, customers]);

  // Prepaid pack hours for the selected customer (separate wallet to $ credit)
  useEffect(() => {
    setPackHoursToApply(0);
    if (!selectedCustomer) {
      setPackHoursBalance(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('pack_hours_balance', { _user_id: selectedCustomer });
      if (!cancelled) setPackHoursBalance(Number(data) || 0);
    })();
    return () => { cancelled = true; };
  }, [selectedCustomer]);

  const addToCart = (product: POSProduct) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const addCustomAmountToCart = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setCart(prev => [...prev, {
      id: `custom-${Date.now()}`,
      name: 'Custom Amount',
      price: amount,
      quantity: 1,
    }]);
    setCustomAmount('');
    setShowCustomAmountDialog(false);
    toast.success(`Added $${amount.toFixed(2)} to cart`);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
      }).filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedBooking(null);
    setSelectedCustomer("");
    setCreditToApply(0);
    setPackHoursToApply(0);
    setActiveTabId(null);
    setActiveTabCustomerName("");
  };

  const addBookingToCart = (booking: UnpaidBooking) => {
    setSelectedBooking(booking);
    setSelectedCustomer(booking.customer_id);
    setCart([{
      id: `booking-${booking.id}`,
      name: `Booking: ${booking.bay_name} - ${format(new Date(booking.booking_date), 'dd/MM')} ${booking.start_time.slice(0, 5)}`,
      price: booking.total_price,
      quantity: 1,
    }]);
    setShowBookingsDialog(false);
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const surchargeAmount = surchargeEnabled ? cartSubtotal * (parseFloat(surchargePercent) || 0) / 100 : 0;
  const subtotalWithSurcharge = cartSubtotal + surchargeAmount;

  // Prepaid hours only pay for bay time, so they are valued at the booking's hourly rate
  const packHourlyRate = selectedBooking
    ? Number(selectedBooking.hourly_rate) ||
      (Number(selectedBooking.duration_hours)
        ? Number(selectedBooking.total_price) / Number(selectedBooking.duration_hours)
        : 0)
    : 0;
  const maxPackHours = selectedBooking
    ? Math.min(packHoursBalance, Number(selectedBooking.duration_hours) || 0)
    : 0;
  const packDiscount = Math.min(
    Math.round(packHoursToApply * packHourlyRate * 100) / 100,
    Math.max(0, subtotalWithSurcharge - creditToApply),
  );
  const total = Math.max(0, subtotalWithSurcharge - creditToApply - packDiscount);

  const [terminalPaymentIntentId, setTerminalPaymentIntentId] = useState<string | null>(null);

  const handleCreditPayment = async () => {
    if (!selectedCustomer || customerBalance <= 0) {
      toast.error("No credit balance available");
      return;
    }

    if (customerBalance >= subtotalWithSurcharge) {
      setIsProcessing(true);
      try {
        const newBalance = customerBalance - subtotalWithSurcharge;
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ deposit_balance: newBalance })
          .eq('user_id', selectedCustomer);

        if (updateError) throw updateError;

        await saveTransaction('credit_balance', null, subtotalWithSurcharge);
        
        toast.success(`Payment successful! $${subtotalWithSurcharge.toFixed(2)} deducted from credit balance`);
        setShowPaymentDialog(false);
        clearCart();
        fetchCustomers();
      } catch (error: any) {
        console.error('Credit payment error:', error);
        toast.error(error.message || "Payment failed");
      } finally {
        setIsProcessing(false);
      }
    } else {
      setShowCreditDialog(true);
    }
  };

  const handleApplyPartialCredit = () => {
    setCreditToApply(customerBalance);
    setShowCreditDialog(false);
    toast.success(`$${customerBalance.toFixed(2)} credit applied. Remaining: $${(subtotalWithSurcharge - customerBalance).toFixed(2)}`);
  };

  const handleCancelTerminal = async () => {
    try {
      await supabase.functions.invoke('stripe-terminal', {
        body: { action: 'cancel_reader_action' },
      });
      toast.info("Payment cancelled");
      setTerminalPaymentIntentId(null);
      setTerminalCountdown(null);
      setIsProcessing(false);
    } catch (error: any) {
      console.error('Cancel error:', error);
      toast.error("Failed to cancel payment");
    }
  };

  const handlePayment = async (method: 'cash' | 'customer_account' | 'pos' | 'credit_balance') => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    if (method === 'credit_balance') {
      handleCreditPayment();
      return;
    }

    setIsProcessing(true);

    try {
      if (method === 'customer_account') {
        if (!selectedCustomer) {
          toast.error("Please select a customer");
          setIsProcessing(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke('stripe-terminal', {
          body: {
            action: 'charge_saved_card',
            amount: total,
            customerId: selectedCustomer,
            bookingId: selectedBooking?.id,
            items: cart,
            description: `POS Sale - ${cart.map(i => i.name).join(', ')}`,
          },
        });

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Payment failed");
        }

        // Save transaction and update booking if applicable
        await saveTransaction(method, data.paymentIntentId);
        toast.success("Payment successful!");
      } else if (method === 'pos') {
        const { data, error } = await supabase.functions.invoke('stripe-terminal', {
          body: {
            action: 'create_payment_intent',
            amount: total,
            customerId: selectedCustomer,
            bookingId: selectedBooking?.id,
            items: cart,
            description: `POS Sale - ${cart.map(i => i.name).join(', ')}`,
          },
        });

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Failed to initiate payment");
        }

        toast.info("Please complete payment on terminal...");
        const paymentIntentId = data.paymentIntentId;
        setTerminalPaymentIntentId(paymentIntentId);
        setTerminalCountdown(180); // 3 minute countdown to match timeout

        // Start countdown timer
        const countdownInterval = setInterval(() => {
          setTerminalCountdown(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(countdownInterval);
              return null;
            }
            return prev - 1;
          });
        }, 1000);

        // Poll for payment status - faster polling for responsive UX
        let attempts = 0;
        const maxAttempts = 180; // 3 minute timeout (180 * 1 second)
        let consecutiveErrors = 0;

        const checkStatus = async () => {
          try {
            const { data: statusData, error: statusError } = await supabase.functions.invoke('stripe-terminal', {
              body: { action: 'check_payment_status', paymentIntentId },
            });

            if (statusError) {
              console.error('Status check error:', statusError);
              consecutiveErrors++;
              // Only fail after 3 consecutive errors
              if (consecutiveErrors >= 3) {
                clearInterval(countdownInterval);
                toast.error("Connection error - please check terminal");
                setTerminalPaymentIntentId(null);
                setTerminalCountdown(null);
                setIsProcessing(false);
                return;
              }
              attempts++;
              if (attempts < maxAttempts) {
                setTimeout(checkStatus, 1000);
              }
              return;
            }

            // Reset error count on successful response
            consecutiveErrors = 0;
            console.log('Payment status:', statusData);

            if (statusData?.paid) {
              clearInterval(countdownInterval);
              // Show success toast IMMEDIATELY before other operations
              toast.success("Payment successful!", {
                description: `$${total.toFixed(2)} paid via card terminal`,
                duration: 5000,
              });
              // Then save transaction in background
              saveTransaction(method, paymentIntentId).catch(console.error);
              setShowPaymentDialog(false);
              setTerminalPaymentIntentId(null);
              setTerminalCountdown(null);
              clearCart();
              setIsProcessing(false);
              return;
            }

            // Only show error if payment was explicitly cancelled
            if (statusData?.status === 'canceled') {
              clearInterval(countdownInterval);
              toast.error("Payment was cancelled");
              setTerminalPaymentIntentId(null);
              setTerminalCountdown(null);
              setIsProcessing(false);
              return;
            }

            // Continue polling for any other status (requires_payment_method, processing, etc.)
            attempts++;
            if (attempts < maxAttempts) {
              // Poll every 1 second for faster response
              setTimeout(checkStatus, 1000);
            } else {
              clearInterval(countdownInterval);
              // Cancel the reader action on timeout
              await supabase.functions.invoke('stripe-terminal', {
                body: { action: 'cancel_reader_action' },
              });
              toast.error("Payment timed out");
              setTerminalPaymentIntentId(null);
              setTerminalCountdown(null);
              setIsProcessing(false);
            }
          } catch (err) {
            console.error('Polling error:', err);
            consecutiveErrors++;
            if (consecutiveErrors >= 3) {
              clearInterval(countdownInterval);
              toast.error("Connection error");
              setTerminalPaymentIntentId(null);
              setTerminalCountdown(null);
              setIsProcessing(false);
              return;
            }
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(checkStatus, 1000);
            }
          }
        };

        // Start polling after just 1 second (faster initial check)
        setTimeout(checkStatus, 1000);
        return; // Don't close dialog yet for POS
      } else {
        // Cash payment - open cash tendered input
        setCashStep('input');
        setCashTendered("");
        setIsProcessing(false);
        return; // Don't close dialog
      }

      setShowPaymentDialog(false);
      clearCart();
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.message || "Payment failed");
    } finally {
      if (method !== 'pos') {
        setIsProcessing(false);
      }
    }
  };

  const saveTransaction = async (paymentMethod: string, stripePaymentIntentId: string | null, creditUsed?: number) => {
    // Build items array - include surcharge as a line item if applicable
    const transactionItems = [...cart];
    if (surchargeEnabled && surchargeAmount > 0) {
      transactionItems.push({
        id: 'surcharge',
        name: `Card Surcharge (${surchargePercent}%)`,
        price: surchargeAmount,
        quantity: 1,
      });
    }
    
    if (creditUsed && creditUsed > 0) {
      transactionItems.push({
        id: 'credit_applied',
        name: 'Credit Balance Applied',
        price: -creditUsed,
        quantity: 1,
      });
    }
    
    if (packHoursToApply > 0 && selectedCustomer) {
      const { error: packError } = await supabase.rpc('consume_pack_hours', {
        _user_id: selectedCustomer,
        _hours: packHoursToApply,
        _booking_id: selectedBooking?.id ?? null,
        _description: 'POS payment - prepaid hours',
      });
      if (packError) throw packError;

      transactionItems.push({
        id: 'pack_hours_applied',
        name: `Prepaid Hours Applied (${packHoursToApply}h)`,
        price: -packDiscount,
        quantity: 1,
      });
    }

    if (creditToApply > 0 && !creditUsed) {
      const newBalance = customerBalance - creditToApply;
      await supabase
        .from('profiles')
        .update({ deposit_balance: newBalance })
        .eq('user_id', selectedCustomer);
      
      transactionItems.push({
        id: 'credit_applied',
        name: 'Credit Balance Applied',
        price: -creditToApply,
        quantity: 1,
      });
    }
    
    // Save POS transaction
    await supabase.from('pos_transactions').insert({
      items: JSON.parse(JSON.stringify(transactionItems)),
      subtotal: cartSubtotal,
      total,
      payment_method: paymentMethod,
      stripe_payment_intent_id: stripePaymentIntentId,
      customer_id: selectedCustomer || null,
      booking_id: selectedBooking?.id || null,
      pack_hours_used: packHoursToApply || null,
    });

    // Close active bar tab if this payment was for a tab
    if (activeTabId) {
      await supabase
        .from('bar_tabs')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', activeTabId);
      fetchOpenTabs();
    }

    // Update booking if this was for a booking
    if (selectedBooking) {
      await supabase
        .from('bookings')
        .update({
          payment_method: paymentMethod === 'pos' ? 'stripeinperson' : paymentMethod,
          stripe_payment_intent_id: stripePaymentIntentId,
        })
        .eq('id', selectedBooking.id);

      fetchUnpaidBookings();
    }

    // Mark local comp player as paid if this was for a comp entry fee
    if (localCompTeamId) {
      const updateData: Record<string, boolean> = {};
      if (localCompPlayerNumber === 1) {
        updateData.player1_paid = true;
      } else if (localCompPlayerNumber === 2) {
        updateData.player2_paid = true;
      } else {
        // Full team payment
        updateData.player1_paid = true;
        updateData.player2_paid = true;
      }
      // Also set paid = true if both players are now paid
      const { data: teamData } = await supabase
        .from('local_comp_teams')
        .select('player1_paid, player2_paid')
        .eq('id', localCompTeamId)
        .single();
      
      const p1 = updateData.player1_paid || teamData?.player1_paid || false;
      const p2 = updateData.player2_paid || teamData?.player2_paid || false;
      if (p1 && p2) updateData.paid = true;
      
      await supabase
        .from('local_comp_teams')
        .update(updateData)
        .eq('id', localCompTeamId);
      setLocalCompTeamId(null);
      setLocalCompPlayerNumber(null);
    }
  };

  const filteredProducts = selectedFamily === 'all'
    ? products
    : products.filter(p => p.family === selectedFamily);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 h-[calc(100vh-64px)]">
          <Skeleton className="h-full w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  // Define all category names (including empty ones for navigation)
  const ALL_FAMILIES = ['Golf', 'Drinks & Snacks', 'Merch & Other'];

  // Cart Panel Component (reused for both layouts)
  const CartPanel = ({ className = "" }: { className?: string }) => (
    <div className={`bg-card flex flex-col ${className}`}>
      <div className="p-4 border-b flex items-center justify-between gap-2">
        <h2 className="font-display text-xl uppercase">Cart</h2>
        <div className="flex items-center gap-1">
          <Button
            variant={activeTabId ? "default" : "outline"}
            size="sm"
            onClick={() => setShowTabsDialog(true)}
            className="gap-1.5"
          >
            <Beer className="h-4 w-4" />
            <span className="hidden sm:inline">Bar Tab</span>
            {openTabs.length > 0 && !activeTabId && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">{openTabs.length}</Badge>
            )}
          </Button>
          {cart.length > 0 && !activeTabId && (
            <Button variant="ghost" size="sm" onClick={clearCart}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Active tab indicator */}
      {activeTabId && (
        <div className="px-4 py-2 border-b bg-primary/5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Beer className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-none">Tab open for</p>
              <p className="text-sm font-medium truncate">{activeTabCustomerName}</p>
            </div>
            {tabSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={detachTab} title="Park tab">
              Park
            </Button>
            <Button variant="ghost" size="sm" onClick={discardActiveTab} title="Discard tab" className="text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Customer Selection */}
      <div className="p-4 border-b">
        <CustomerSearchCombobox
          customers={customers}
          value={selectedCustomer}
          onValueChange={setSelectedCustomer}
        />
      </div>

      {/* Cart Items */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${isMobile ? 'max-h-40' : ''}`}>
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mb-2 opacity-50" />
            <p>Cart is empty</p>
          </div>
        ) : (
          cart.map(item => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-base truncate">{item.name}</p>
                  <p className="text-primary font-bold text-lg">${(item.price * item.quantity).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => updateQuantity(item.id, -1)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <span className="w-8 text-center text-lg font-medium">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => updateQuantity(item.id, 1)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive"
                    onClick={() => removeFromCart(item.id)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Totals & Pay */}
      <div className="p-4 border-t space-y-4">
        {/* Surcharge Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="surcharge-toggle"
              checked={surchargeEnabled}
              onCheckedChange={setSurchargeEnabled}
            />
            <Label htmlFor="surcharge-toggle" className="text-sm cursor-pointer">
              Card Surcharge
            </Label>
          </div>
          {surchargeEnabled && (
            <Select value={surchargePercent} onValueChange={setSurchargePercent}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5%</SelectItem>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="15">15%</SelectItem>
                <SelectItem value="20">20%</SelectItem>
                <SelectItem value="25">25%</SelectItem>
                <SelectItem value="30">30%</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Subtotal and Surcharge breakdown */}
        {((surchargeEnabled && surchargeAmount > 0) || creditToApply > 0 || packDiscount > 0) && (
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>${cartSubtotal.toFixed(2)}</span>
            </div>
            {surchargeEnabled && surchargeAmount > 0 && (
              <div className="flex justify-between">
                <span>Surcharge ({surchargePercent}%)</span>
                <span>${surchargeAmount.toFixed(2)}</span>
              </div>
            )}
            {creditToApply > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Credit Applied</span>
                <span>-${creditToApply.toFixed(2)}</span>
              </div>
            )}
            {packDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Prepaid Hours ({packHoursToApply}h)</span>
                <span>-${packDiscount.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-primary">${total.toFixed(2)}</span>
        </div>

        {activeTabId ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-14 text-lg"
              onClick={saveAndExitTab}
            >
              <Save className="h-5 w-5 mr-2" />
              Save
            </Button>
            <Button
              className="flex-[2] h-14 text-lg font-display uppercase"
              disabled={cart.length === 0}
              onClick={() => setShowPaymentDialog(true)}
            >
              <CreditCard className="h-5 w-5 mr-2" />
              Send to POS, ${total.toFixed(2)}
            </Button>
          </div>
        ) : (
          <Button
            className="w-full h-14 text-lg font-display uppercase"
            disabled={cart.length === 0}
            onClick={() => setShowPaymentDialog(true)}
          >
            <CreditCard className="h-5 w-5 mr-2" />
            Pay ${total.toFixed(2)}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <AdminLayout>
      {isMobile ? (
        /* Mobile Layout: Products on top, Cart below */
        <div className="flex flex-col h-[calc(100vh-64px)]">
          {/* Products Section */}
          <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
            {/* Header with back button and unpaid bookings */}
            <div className="flex items-center justify-between mb-4">
              {selectedFamily !== 'categories' && (
                <Button
                  variant="ghost"
                  onClick={() => setSelectedFamily('categories')}
                  className="gap-2"
                  size="sm"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              {selectedFamily === 'categories' && <div />}
              <Button
                variant="outline"
                onClick={() => setShowBookingsDialog(true)}
                className="shrink-0"
                size="sm"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Unpaid ({unpaidBookings.length})
              </Button>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
              {loadingProducts ? (
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="aspect-square" />
                  ))}
                </div>
              ) : selectedFamily === 'categories' ? (
                /* Category Selection View */
                <div className="grid grid-cols-3 gap-3">
                  {ALL_FAMILIES.map(family => {
                    const productCount = products.filter(p => p.family === family).length;
                    return (
                      <button
                        key={family}
                        onClick={() => setSelectedFamily(family)}
                        className="aspect-square bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center active:bg-muted transition-colors"
                      >
                        <span className="font-display text-base uppercase tracking-wide">{family}</span>
                        <span className="text-muted-foreground text-sm mt-1">
                          {productCount} {productCount === 1 ? 'item' : 'items'}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowCustomAmountDialog(true)}
                    className="aspect-square bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center active:bg-muted transition-colors border-dashed border-primary/50"
                  >
                    <DollarSign className="h-6 w-6 text-primary mb-1" />
                    <span className="font-display text-base uppercase tracking-wide text-primary">Custom Amount</span>
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-base">No products in {selectedFamily}</p>
                </div>
              ) : (
                /* Products Grid */
                <div className="grid grid-cols-3 gap-3">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="aspect-square bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center active:bg-muted transition-colors"
                    >
                      <span className="font-medium text-base line-clamp-2">{product.name}</span>
                      <span className="text-primary font-bold text-lg mt-1">${product.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart Section - Fixed at bottom on mobile */}
          <CartPanel className="border-t shrink-0" />
        </div>
      ) : (
        /* Desktop Layout: Side by side */
        <div className="flex h-[calc(100vh-64px)]">
          {/* Products Grid */}
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            {/* Header with back button and unpaid bookings */}
            <div className="flex items-center justify-between mb-4">
              {selectedFamily !== 'categories' && (
                <Button
                  variant="ghost"
                  onClick={() => setSelectedFamily('categories')}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back to Categories
                </Button>
              )}
              {selectedFamily === 'categories' && <div />}
              <Button
                variant="outline"
                onClick={() => setShowBookingsDialog(true)}
                className="shrink-0"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Unpaid Bookings ({unpaidBookings.length})
              </Button>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
              {loadingProducts ? (
                <div className="grid grid-cols-3 gap-6 w-full">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : selectedFamily === 'categories' ? (
                /* Category Selection View */
                <div className="grid grid-cols-3 gap-6 w-full">
                  {ALL_FAMILIES.map(family => {
                    const productCount = products.filter(p => p.family === family).length;
                    return (
                      <button
                        key={family}
                        onClick={() => setSelectedFamily(family)}
                        className="w-full bg-card border rounded-lg p-8 flex flex-col items-center justify-center text-center active:bg-muted transition-colors min-h-[140px]"
                      >
                        <span className="font-display text-lg uppercase tracking-wide">{family}</span>
                        <span className="text-muted-foreground text-base mt-1">
                          {productCount} {productCount === 1 ? 'item' : 'items'}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowCustomAmountDialog(true)}
                    className="w-full bg-card border rounded-lg p-8 flex flex-col items-center justify-center text-center active:bg-muted transition-colors min-h-[140px] border-dashed border-primary/50"
                  >
                    <DollarSign className="h-8 w-8 text-primary mb-2" />
                    <span className="font-display text-lg uppercase tracking-wide text-primary">Custom Amount</span>
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <ShoppingCart className="h-16 w-16 mb-4 opacity-50" />
                  <p className="text-lg">No products in {selectedFamily}</p>
                  <p className="text-sm">Add products in Settings to get started</p>
                </div>
              ) : (
                /* Products Grid */
                <div className="grid grid-cols-3 gap-6 w-full">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="w-full bg-card border rounded-lg p-8 flex flex-col items-center justify-center text-center active:bg-muted transition-colors min-h-[140px]"
                    >
                      <span className="font-medium text-lg line-clamp-2">{product.name}</span>
                      <span className="text-primary font-bold text-xl mt-2">${product.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart Panel - Side panel on desktop */}
          <CartPanel className="w-80 lg:w-96 border-l" />
        </div>
      )}

      {/* Payment Method Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={(open) => { setShowPaymentDialog(open); if (!open) { setCashStep(null); setCashTendered(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase text-center">
              Pay ${total.toFixed(2)}
            </DialogTitle>
            {creditToApply > 0 && (
              <p className="text-sm text-green-600 text-center">
                (${creditToApply.toFixed(2)} credit already applied)
              </p>
            )}
            {surchargeEnabled && surchargeAmount > 0 && (
              <p className="text-sm text-muted-foreground text-center">
                (includes ${surchargeAmount.toFixed(2)} card surcharge)
              </p>
            )}
          </DialogHeader>
          <div className="space-y-3 pt-4">
            {selectedCustomer && customerBalance > 0 && creditToApply === 0 && (
              <Button
                variant="outline"
                className="w-full h-16 text-lg justify-start gap-4 border-green-200 bg-green-50 hover:bg-green-100"
                onClick={() => handlePayment('credit_balance')}
                disabled={isProcessing}
              >
                <Wallet className="h-8 w-8 text-green-600" />
                <div className="text-left">
                  <span className="text-green-700">Credit Balance</span>
                  <p className="text-sm text-green-600">${customerBalance.toFixed(2)} available</p>
                </div>
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full h-16 text-lg justify-start gap-4"
              onClick={() => handlePayment('cash')}
              disabled={isProcessing || cashStep !== null}
            >
              <Banknote className="h-8 w-8 text-green-600" />
              <span>Cash</span>
            </Button>

            {/* Cash Tendered Input */}
            {cashStep === 'input' && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <Label className="text-sm font-medium">Cash Tendered</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      className="pl-7 text-lg h-12"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                  <Button
                    className="h-12 px-6"
                    disabled={!cashTendered || parseFloat(cashTendered) < total}
                    onClick={() => setCashStep('change')}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12"
                    onClick={() => { setCashStep(null); setCashTendered(""); }}
                  >
                    Cancel
                  </Button>
                </div>
                {cashTendered && parseFloat(cashTendered) < total && (
                  <p className="text-sm text-destructive">Amount must be at least ${total.toFixed(2)}</p>
                )}
              </div>
            )}

            {/* Change Due Display */}
            {cashStep === 'change' && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">Cash Tendered: ${parseFloat(cashTendered).toFixed(2)}</p>
                  <p className="text-3xl font-bold text-primary">
                    Change: ${(parseFloat(cashTendered) - total).toFixed(2)}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={() => { setCashStep('input'); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 h-12"
                    onClick={async () => {
                      setIsProcessing(true);
                      try {
                        await saveTransaction('cash', null);
                        toast.success("Cash payment recorded!");
                        setCashStep(null);
                        setCashTendered("");
                        setShowPaymentDialog(false);
                        clearCart();
                      } catch (error: any) {
                        toast.error(error.message || "Payment failed");
                      } finally {
                        setIsProcessing(false);
                      }
                    }}
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Processing..." : "Confirm Payment"}
                  </Button>
                </div>
              </div>
            )}
            {maxPackHours > 0 && packHoursToApply === 0 && (
              <Button
                variant="outline"
                className="w-full h-16 text-lg justify-start gap-4"
                onClick={() => {
                  setPackHoursToApply(maxPackHours);
                  toast.success(`${maxPackHours} prepaid ${maxPackHours === 1 ? 'hour' : 'hours'} applied`);
                }}
                disabled={isProcessing}
              >
                <Clock className="h-8 w-8 text-green-600" />
                <div className="text-left">
                  <span>Prepaid Hours</span>
                  <p className="text-xs text-muted-foreground">
                    {packHoursBalance}h available - apply {maxPackHours}h to this session
                  </p>
                </div>
              </Button>
            )}
            {packHoursToApply > 0 && total <= 0 && (
              <Button
                className="w-full h-16 text-lg justify-start gap-4"
                onClick={async () => {
                  setIsProcessing(true);
                  try {
                    await saveTransaction('pack_hours', null);
                    toast.success('Paid with prepaid hours');
                    setShowPaymentDialog(false);
                    clearCart();
                  } catch (error: any) {
                    toast.error(error.message || 'Payment failed');
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
              >
                <Clock className="h-8 w-8" />
                <span>Complete with Prepaid Hours</span>
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full h-16 text-lg justify-start gap-4"
              onClick={() => handlePayment('customer_account')}
              disabled={isProcessing || !selectedCustomer}
            >
              <Wallet className="h-8 w-8 text-blue-600" />
              <div className="text-left">
                <span>Customer Account</span>
                {!selectedCustomer && (
                  <p className="text-xs text-muted-foreground">Select a customer first</p>
                )}
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full h-16 text-lg justify-start gap-4"
              onClick={() => handlePayment('pos')}
              disabled={isProcessing}
            >
              <CreditCard className="h-8 w-8 text-primary" />
              <span>Card Terminal</span>
            </Button>
          </div>
          {isProcessing && terminalPaymentIntentId && (
            <div className="text-center py-6 space-y-4 border-t mt-4">
              <div className="flex items-center justify-center gap-3">
                <div className="animate-pulse">
                  <CreditCard className="h-10 w-10 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-lg">Awaiting tap or insert...</p>
                  <p className="text-sm text-muted-foreground">Present card on terminal</p>
                </div>
              </div>
              {terminalCountdown !== null && (
                <div className="text-3xl font-bold text-primary">
                  {Math.floor(terminalCountdown / 60)}:{(terminalCountdown % 60).toString().padStart(2, '0')}
                </div>
              )}
              <Button
                variant="destructive"
                onClick={handleCancelTerminal}
                className="w-full"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel Payment
              </Button>
            </div>
          )}
          {isProcessing && !terminalPaymentIntentId && (
            <div className="text-center py-4">
              <p className="text-muted-foreground">Processing payment...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Partial Credit Dialog */}
      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase text-center">
              Partial Credit
            </DialogTitle>
            <DialogDescription className="text-center pt-2">
              Your credit balance (${customerBalance.toFixed(2)}) doesn't cover the full amount (${subtotalWithSurcharge.toFixed(2)}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Total Amount</span>
                <span>${subtotalWithSurcharge.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>Credit to Apply</span>
                <span>-${customerBalance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Remaining to Pay</span>
                <span>${(subtotalWithSurcharge - customerBalance).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCreditDialog(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleApplyPartialCredit}
              >
                Apply ${customerBalance.toFixed(2)} Credit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unpaid Bookings Dialog */}
      <Dialog open={showBookingsDialog} onOpenChange={setShowBookingsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase">
              Unpaid Bookings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {unpaidBookings.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No unpaid bookings
              </p>
            ) : (
              unpaidBookings.map(booking => (
                <Card
                  key={booking.id}
                  className="p-4 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => addBookingToCart(booking)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{booking.customer_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.bay_name} • {format(new Date(booking.booking_date), 'dd/MM/yyyy')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {booking.start_time.slice(0, 5)} - {booking.end_time.slice(0, 5)}
                      </p>
                    </div>
                    <span className="text-primary font-bold text-lg">
                      ${booking.total_price.toFixed(2)}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bar Tabs Dialog */}
      <Dialog open={showTabsDialog} onOpenChange={setShowTabsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase flex items-center gap-2">
              <Beer className="h-5 w-5" /> Bar Tabs
            </DialogTitle>
            <DialogDescription>
              Run a tab for a customer. Items auto-save as you add them. Send to POS when ready to take payment.
            </DialogDescription>
          </DialogHeader>

          {!activeTabId && (
            <div className="space-y-3 pt-2">
              <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
                <Label className="text-sm font-medium">Start a new tab</Label>
                <CustomerSearchCombobox
                  customers={customers}
                  value={selectedCustomer}
                  onValueChange={setSelectedCustomer}
                />
                <Button
                  className="w-full"
                  onClick={startNewTab}
                  disabled={!selectedCustomer}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Start Tab
                </Button>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Open tabs ({openTabs.length})</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {openTabs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No open tabs
                    </p>
                  ) : (
                    openTabs.map(tab => (
                      <Card
                        key={tab.id}
                        className="p-3 cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => loadTab(tab)}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{tab.customer_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {tab.items.length} {tab.items.length === 1 ? 'item' : 'items'} • updated {format(new Date(tab.updated_at), 'h:mm a')}
                            </p>
                          </div>
                          <span className="text-primary font-bold shrink-0">
                            ${Number(tab.subtotal).toFixed(2)}
                          </span>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTabId && (
            <div className="space-y-3 pt-2">
              <div className="border rounded-lg p-4 bg-primary/5">
                <p className="text-xs text-muted-foreground">Active tab</p>
                <p className="font-medium text-lg">{activeTabCustomerName}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Items added to the cart now save automatically. When ready, hit "Send to POS" to take payment.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={detachTab}>
                  Park Tab
                </Button>
                <Button variant="destructive" className="flex-1" onClick={discardActiveTab}>
                  Discard Tab
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Amount Dialog */}
      <Dialog open={showCustomAmountDialog} onOpenChange={setShowCustomAmountDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase text-center">
              Custom Amount
            </DialogTitle>
            <DialogDescription className="text-center pt-2">
              Enter an amount to add to the cart
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">$</span>
              <Input
                type="number"
                step="0.01"
                min={0.01}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="pl-8 text-2xl h-14 font-medium"
                placeholder="0.00"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCustomAmountToCart();
                }}
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => { setShowCustomAmountDialog(false); setCustomAmount(''); }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-12"
                onClick={addCustomAmountToCart}
                disabled={!customAmount || parseFloat(customAmount) <= 0}
              >
                Add to Cart
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
