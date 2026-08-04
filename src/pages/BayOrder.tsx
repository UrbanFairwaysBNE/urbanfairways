import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ShoppingCart, Plus, Minus, Check, Loader2 } from "lucide-react";
import birdieLogo from "@/assets/venue-logo.png";
import { useTenant } from "@/config/tenant";

interface POSProduct {
  id: string;
  name: string;
  price: number;
}

interface CartItem extends POSProduct {
  quantity: number;
}

interface ServiceHours {
  isOpen: boolean;
  message: string;
}

export default function BayOrder() {
  const { tenant } = useTenant();
  const { bayNumber } = useParams<{ bayNumber: string }>();
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [serviceHours, setServiceHours] = useState<ServiceHours>({ isOpen: true, message: "" });

  const validBays = [4, 5, 6];
  const bay = parseInt(bayNumber || "0");
  const isValidBay = validBays.includes(bay);

  useEffect(() => {
    if (isValidBay) {
      checkServiceHours();
      fetchProducts();
    } else {
      setLoading(false);
    }
  }, [isValidBay]);

  const checkServiceHours = async () => {
    const { data, error } = await supabase
      .from("table_service_hours")
      .select("*");

    if (error || !data) {
      console.error("Error fetching service hours:", error);
      return; // Default to open if we can't fetch hours
    }

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday, 6=Saturday
    const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

    const todayHours = data.find((h) => h.day_of_week === dayOfWeek);

    const formatTime = (time: string) => {
      const [hours] = time.split(":");
      const hour = parseInt(hours);
      if (hour === 0) return "12:00 AM";
      if (hour === 12) return "12:00 PM";
      if (hour > 12) return `${hour - 12}:00 PM`;
      return `${hour}:00 AM`;
    };

    if (!todayHours || !todayHours.is_open) {
      setServiceHours({
        isOpen: false,
        message: "Closed today",
      });
      return;
    }

    if (currentTime < todayHours.open_time || currentTime >= todayHours.close_time) {
      setServiceHours({
        isOpen: false,
        message: `Closed, opens ${formatTime(todayHours.open_time)} to ${formatTime(todayHours.close_time)}`,
      });
      return;
    }

    setServiceHours({ isOpen: true, message: "" });
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("pos_products")
      .select("id, name, price")
      .eq("is_active", true)
      .eq("family", "Drinks & Snacks")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to load menu");
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const addToCart = (product: POSProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      toast.error("Please add items to your order");
      return;
    }

    setSubmitting(true);

    try {
      const orderItems = cart.map((item) => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }));

      const { error } = await supabase.from("bay_orders").insert({
        bay_number: bay,
        items: orderItems,
        total: total,
        status: "pending",
      });

      if (error) throw error;

      setOrderSubmitted(true);
      setCart([]);
      toast.success("Order submitted! Staff will bring your items shortly.");
    } catch (error: any) {
      console.error("Order error:", error);
      toast.error("Failed to submit order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isValidBay) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-sm">
          <h1 className="text-xl font-semibold mb-2">Invalid Bay</h1>
          <p className="text-muted-foreground">
            This QR code is not valid. Please scan the QR code on your bay.
          </p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!serviceHours.isOpen) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-sm">
          <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Table Service Closed</h1>
          <p className="text-muted-foreground">
            {serviceHours.message}
          </p>
        </Card>
      </div>
    );
  }

  if (orderSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-sm">
          <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Order Received!</h1>
          <p className="text-muted-foreground mb-6">
            Your order for Bay {bay} has been sent to the bar. A staff member
            will bring your items shortly.
          </p>
          <Button onClick={() => setOrderSubmitted(false)} className="w-full">
            Place Another Order
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-4 sticky top-0 z-10 safe-area-top">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <img src={birdieLogo} alt={tenant.venue_name} className="h-8" />
          <span className="font-display text-lg">Bay {bay}</span>
        </div>
      </header>

      {/* Menu */}
      <div className="max-w-lg mx-auto p-4">
        <h2 className="font-display text-2xl text-primary mb-4">
          Drinks & Snacks
        </h2>

        <div className="space-y-3">
          {products.map((product) => {
            const cartItem = cart.find((c) => c.id === product.id);
            const quantity = cartItem?.quantity || 0;

            return (
              <Card key={product.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-medium">{product.name}</h3>
                    <p className="text-primary font-semibold">
                      ${product.price.toFixed(2)}
                    </p>
                  </div>

                  {quantity === 0 ? (
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => addToCart(product)}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => updateQuantity(product.id, -1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-semibold">
                        {quantity}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => updateQuantity(product.id, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {products.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              No items available at the moment.
            </p>
          </Card>
        )}
      </div>

      {/* Cart Footer */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg p-4 safe-area-bottom">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)} items
                </span>
              </div>
              <span className="font-display text-xl text-primary">
                ${total.toFixed(2)}
              </span>
            </div>
            <Button
              onClick={handleSubmitOrder}
              disabled={submitting}
              className="w-full"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending Order...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Order
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              A staff member will bring your order and take payment
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
