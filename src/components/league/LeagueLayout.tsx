import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/config/tenant";
import birdiesBLogo from "@/assets/birdies-b-logo.png";
import {
  LayoutDashboard,
  History,
  Trophy,
  User,
  LogOut,
  Menu,
  X,
  ArrowLeft,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LeagueLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/league", label: "Dashboard", icon: LayoutDashboard },
  { path: "/league/rounds", label: "Rounds", icon: History },
  { path: "/league/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/league/highlights", label: "Highlights", icon: Film },
  { path: "/league/profile", label: "Profile & Stats", icon: User },
];

export function LeagueLayout({ children }: LeagueLayoutProps) {
  const { tenant } = useTenant();
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary sticky top-0 z-50 safe-area-top">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Link to="/league" className="flex items-center">
              <img src={birdiesBLogo} alt={tenant.venue_name} className="h-10 w-auto" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-primary-foreground p-2"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
          <nav className="bg-primary animate-fade-in">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-4 font-inter text-base",
                    isActive
                      ? "bg-birdies-orange text-white rounded-lg mx-4 my-1"
                      : "text-primary-foreground/90"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
            <div className="border-t border-primary-foreground/20 mt-2">
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-4 font-inter text-base text-primary-foreground/90"
              >
                <ArrowLeft className="h-5 w-5" />
                Back to Hub
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-4 font-inter text-base text-primary-foreground/80 w-full"
              >
                <LogOut className="h-5 w-5" />
                Sign Out
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}