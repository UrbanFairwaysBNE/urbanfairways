import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/useAuth";
import { isHubHost } from "@/lib/hub-host";
import venueLogo from "@/assets/venue-logo-dark.png";
import venueAppIcon from "@/assets/venue-app-icon.png";
import MarketingHome from "./marketing/MarketingHome";
import { useTenant } from "@/config/tenant";


/**
 * Hostname routing:
 *  - any `hub.*` host (e.g. hub.myvenue.com.au) → Hub login (AuthForm)
 *  - `/hub` or `?hub=1` on any host            → Hub login (baseline/testing)
 *  - everything else (main domain, lovable preview, localhost)
 *      → public marketing site
 *
 * Hub can still be reached from any host via deep links (/dashboard, /booking, …).
 */


const Index = () => {
  const { tenant } = useTenant();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const hubHost = isHubHost();

  useEffect(() => {
    if (hubHost && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [hubHost, isAuthenticated, navigate]);

  // Public marketing site
  if (!hubHost) {
    return <MarketingHome />;
  }

  // Hub login
  if (authLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background safe-area-top safe-area-bottom">
        <img src={venueAppIcon} alt={tenant.venue_name} className="h-20 mb-6" />
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center gap-8 p-6 safe-area-top">
        <img src={venueLogo} alt={tenant.venue_name} className="h-8" />
        <div className="w-full max-w-md animate-fade-in">
          <AuthForm />
        </div>
      </main>


      <footer className="bg-primary py-4 px-6 text-center">
        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} {tenant.venue_name}. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default Index;
