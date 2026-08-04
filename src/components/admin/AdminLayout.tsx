import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  Calendar, 
  Users, 
  LayoutDashboard, 
  Menu, 
  X, 
  LogOut,
  ChevronLeft,
  ShoppingCart,
  Settings,
  Zap,
  Mail,
  Bell,
  Trophy,
  BarChart3,
  Target,
  ClipboardCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import venueLogo from "@/assets/venue-logo.png";
import { AdminOrderNotifications } from "./AdminOrderNotifications";
import { useTenant } from "@/config/tenant";



interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/timetable", label: "Timetable", icon: Calendar },
  { path: "/admin/pos", label: "POS", icon: ShoppingCart },
  { path: "/admin/customers", label: "Customers", icon: Users },
  { path: "/admin/bay-control", label: "Bay Control", icon: Zap },
  { path: "/admin/sgt", label: "SGT Manager", icon: Trophy },
  { path: "/admin/local-comps", label: "Local Comps", icon: Target },
  { path: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/admin/marketing", label: "Marketing", icon: Mail },
  { path: "/admin/announcements", label: "Announcements", icon: Bell },
  { path: "/admin/settings", label: "Settings", icon: Settings },
  { path: "/admin/setup-status", label: "Setup Status", icon: ClipboardCheck },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const { tenant } = useTenant();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
      duration: 4000,
    });
    navigate("/");
  };

  const isActive = (path: string) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-sidebar border-r border-sidebar-border">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <Link to="/admin" className="flex items-center gap-3">
              <img src={venueLogo} alt={tenant.venue_name} className="h-8" />
            </Link>

            <AdminOrderNotifications />
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive(item.path)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-2">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="font-medium">Back to Hub</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors w-full"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar border-b border-sidebar-border safe-area-top">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-sidebar-foreground"
            >
              {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
          <Link to="/admin" className="flex items-center gap-2">
            <img src={venueLogo} alt={tenant.venue_name} className="h-7" />
            <AdminOrderNotifications />
          </Link>
        </div>

        {/* Mobile Menu */}
        {sidebarOpen && (
          <nav className="p-4 space-y-1 bg-sidebar border-b border-sidebar-border">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive(item.path)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
            <div className="pt-2 mt-2 border-t border-sidebar-border space-y-1">
              <Link
                to="/dashboard"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
                <span className="font-medium">Back to Hub</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors w-full"
              >
                <LogOut className="h-5 w-5" />
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          </nav>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:pt-0 pt-[calc(4rem+env(safe-area-inset-top))] overflow-auto">
        {children}
      </main>

    </div>
  );
}

