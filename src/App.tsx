import { lazy, Suspense, useEffect, useRef } from "react";
import BrandLoader from "@/components/brand/BrandLoader";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import ScrollToTop from "@/components/ScrollToTop";
import { loadTenantSnapshot } from "@/config/tenant";


// Lazy load all pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Booking = lazy(() => import("./pages/Booking"));
const BookingSuccess = lazy(() => import("./pages/BookingSuccess"));
const MyBookings = lazy(() => import("./pages/MyBookings"));
const MyAccount = lazy(() => import("./pages/MyAccount"));
const Membership = lazy(() => import("./pages/Membership"));
const LeagueHub = lazy(() => import("./pages/LeagueHub"));
const LeagueRounds = lazy(() => import("./pages/LeagueRounds"));
const LeagueLeaderboard = lazy(() => import("./pages/LeagueLeaderboard"));
const LeagueProfile = lazy(() => import("./pages/LeagueProfile"));
const LeagueRegister = lazy(() => import("./pages/LeagueRegister"));
const LeagueHighlights = lazy(() => import("./pages/LeagueHighlights"));
const LeagueHighlightExports = lazy(() => import("./pages/LeagueHighlightExports"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const BayController = lazy(() => import("./pages/BayController"));
const EmbedLeaderboard = lazy(() => import("./pages/EmbedLeaderboard"));
const EmbedTVCurrentWeek = lazy(() => import("./pages/EmbedTVCurrentWeek"));
const EmbedTVPreviousWeek = lazy(() => import("./pages/EmbedTVPreviousWeek"));
const EmbedTVMonthlyWinner = lazy(() => import("./pages/EmbedTVMonthlyWinner"));
const EmbedTVStatsCurrentWeek = lazy(() => import("./pages/EmbedTVStatsCurrentWeek"));
const EmbedTVStatsPreviousWeek = lazy(() => import("./pages/EmbedTVStatsPreviousWeek"));
const CardAdded = lazy(() => import("./pages/CardAdded"));
const WelcomePreview = lazy(() => import("./pages/WelcomePreview"));
const QuickStartGuide = lazy(() => import("./pages/QuickStartGuide"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const BayOrder = lazy(() => import("./pages/BayOrder"));
const Feedback = lazy(() => import("./pages/Feedback"));
const CompSurvey = lazy(() => import("./pages/CompSurvey"));
const CompRegisterTeam = lazy(() => import("./pages/CompRegisterTeam"));
const CompHub = lazy(() => import("./pages/CompHub"));
const CompFindPartner = lazy(() => import("./pages/CompFindPartner"));
const CompLeaderboard = lazy(() => import("./pages/CompLeaderboard"));
const EmbedLocalCompLeaderboard = lazy(() => import("./pages/EmbedLocalCompLeaderboard"));
const Gift = lazy(() => import("./pages/Gift"));
const SwingLab = lazy(() => import("./pages/SwingLab"));
const SwingLabProgress = lazy(() => import("./pages/SwingLabProgress"));


// Public marketing site pages
const MarketingAbout = lazy(() => import("./pages/marketing/MarketingAbout"));
const MarketingMembership = lazy(() => import("./pages/marketing/MarketingMembership"));
const MarketingLeague = lazy(() => import("./pages/marketing/MarketingLeague"));
const MarketingCompete = lazy(() => import("./pages/marketing/MarketingCompete"));
const MarketingContact = lazy(() => import("./pages/marketing/MarketingContact"));
const MarketingFAQs = lazy(() => import("./pages/marketing/MarketingFAQs"));
const MarketingStaffedHours = lazy(() => import("./pages/marketing/MarketingStaffedHours"));
const MarketingGateAccess = lazy(() => import("./pages/marketing/MarketingGateAccess"));
const MarketingWhatsOn = lazy(() => import("./pages/marketing/MarketingWhatsOn"));
const MarketingCoaching = lazy(() => import("./pages/marketing/MarketingCoaching"));
const MarketingTPI = lazy(() => import("./pages/marketing/MarketingTPI"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminTimetable = lazy(() => import("./pages/admin/AdminTimetable"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminPOS = lazy(() => import("./pages/admin/AdminPOS"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminSetupStatus = lazy(() => import("./pages/admin/AdminSetupStatus"));
const AdminBulkEmail = lazy(() => import("./pages/admin/AdminBulkEmail"));
const AdminBayControl = lazy(() => import("./pages/admin/AdminBayControl"));
const AdminMarketing = lazy(() => import("./pages/admin/AdminMarketing"));
const AdminCustomerImport = lazy(() => import("./pages/admin/AdminCustomerImport"));
const AdminAnnouncements = lazy(() => import("./pages/admin/AdminAnnouncements"));
const AdminSGTManager = lazy(() => import("./pages/admin/AdminSGTManager"));
const AdminLocalComps = lazy(() => import("./pages/admin/AdminLocalComps"));
const AdminHighlightExports = lazy(() => import("./pages/admin/AdminHighlightExports"));
const AdminAllHighlightExports = lazy(() => import("./pages/admin/AdminAllHighlightExports"));
const AdminHighlightReview = lazy(() => import("./pages/admin/AdminHighlightReview"));
const EmbedTVLocalComp = lazy(() => import("./pages/EmbedTVLocalComp"));
const EmbedCompete = lazy(() => import("./pages/EmbedCompete"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes default - prevents unnecessary refetches
      gcTime: 1000 * 60 * 30, // 30 minutes cache retention
      retry: 2,
      refetchOnWindowFocus: false, // Disable for commercial reliability
      refetchOnReconnect: true,
    },
  },
});

// Detect if running in Electron (uses hash routing)
const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.isElectron;
const Router = isElectron ? HashRouter : BrowserRouter;

// Loading fallback component
const PageLoader = () => <BrandLoader fullscreen size={96} label="Loading..." />;

// Deep link handler component - handles the app's custom URL scheme
function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Listen for app URL open events (deep links)
    const setupAppUrlListener = async () => {
      await CapacitorApp.addListener('appUrlOpen', (event) => {
        console.log('[DeepLink] App opened with URL:', event.url);
        
        try {
          // Parse the deep link URL
          // Format: <scheme>://booking-success?booking_id=xxx
          // or: <scheme>://card-added
          const url = new URL(event.url);
          const path = url.hostname; // e.g., "booking-success", "card-added"
          const params = url.searchParams;
          
          if (path === 'booking-success') {
            const bookingId = params.get('booking_id');
            console.log('[DeepLink] Navigating to booking success:', bookingId);
            navigate(`/booking-success?booking_id=${bookingId}`);
          } else if (path === 'booking-cancelled') {
            const bookingId = params.get('booking_id');
            console.log('[DeepLink] Navigating to booking (cancelled):', bookingId);
            navigate(`/booking?booking_cancelled=true&booking_id=${bookingId}`);
          } else if (path === 'card-added') {
            console.log('[DeepLink] Card added successfully, navigating to card-added page');
            navigate('/card-added');
          } else if (path === 'card-cancelled') {
            console.log('[DeepLink] Card setup cancelled, navigating to booking');
            navigate('/booking?setup_cancelled=true');
          }
        } catch (error) {
          console.error('[DeepLink] Error parsing URL:', error);
        }
      });
    };

    setupAppUrlListener();

    return () => {
      CapacitorApp.removeAllListeners();
    };
  }, [navigate]);

  return null;
}

const LAST_ROUTE_KEY = "bb:lastRoute";

// iOS may reload the webview after switching to Safari. This restores the last route
// so users land back on the Booking screen instead of "/".
function NativeRoutePersistence() {
  const location = useLocation();
  const navigate = useNavigate();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const current = `${location.pathname}${location.search}`;
    localStorage.setItem(LAST_ROUTE_KEY, current);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (restoredRef.current) return;
    restoredRef.current = true;

    const saved = localStorage.getItem(LAST_ROUTE_KEY);
    if (!saved) return;

    if (location.pathname === "/" && saved !== "/") {
      console.log("[NativeNav] Restoring last route:", saved);
      navigate(saved, { replace: true });
    }
  }, [navigate, location.pathname]);

  return null;
}

// Push notification initializer component
function PushNotificationInit() {
  usePushNotifications();
  return null;
}

const App = () => {
  useEffect(() => {
    loadTenantSnapshot();
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PushNotificationInit />
      <Router>
        <ScrollToTop />



        <DeepLinkHandler />
        <NativeRoutePersistence />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/app" element={<Index />} />
            <Route path="/hub" element={<Index />} />


            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/booking-success" element={<BookingSuccess />} />
            <Route path="/my-bookings" element={<MyBookings />} />
            <Route path="/my-account" element={<MyAccount />} />
            <Route path="/membership" element={<Membership />} />
            <Route path="/league" element={<LeagueHub />} />
            <Route path="/league/rounds" element={<LeagueRounds />} />
            <Route path="/league/leaderboard" element={<LeagueLeaderboard />} />
            <Route path="/league/profile" element={<LeagueProfile />} />
            <Route path="/league/register" element={<LeagueRegister />} />
            <Route path="/league/highlights" element={<LeagueHighlights />} />
            <Route path="/league/highlights/:sessionId" element={<LeagueHighlightExports />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            <Route path="/embed/leaderboard" element={<EmbedLeaderboard />} />
            <Route path="/embed/tv-current-week" element={<EmbedTVCurrentWeek />} />
            <Route path="/embed/tv-previous-week" element={<EmbedTVPreviousWeek />} />
            <Route path="/embed/tv-monthly-winner" element={<EmbedTVMonthlyWinner />} />
            <Route path="/embed/tv-stats-current-week" element={<EmbedTVStatsCurrentWeek />} />
            <Route path="/embed/tv-stats-previous-week" element={<EmbedTVStatsPreviousWeek />} />


            <Route path="/bay-controller" element={<BayController />} />
            <Route path="/card-added" element={<CardAdded />} />
            <Route path="/welcome-preview" element={<WelcomePreview />} />
            <Route path="/quick-start-guide" element={<QuickStartGuide />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/order/:bayNumber" element={<BayOrder />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/feedback/:token" element={<Feedback />} />
            <Route path="/feedback/:token/:quick" element={<Feedback />} />
            <Route path="/comp-survey" element={<CompSurvey />} />
            <Route path="/compete" element={<EmbedCompete />} />
            <Route path="/compete/leaderboard" element={<EmbedLeaderboard />} />
            <Route path="/compete/local-comp-leaderboard" element={<EmbedLocalCompLeaderboard />} />
            <Route path="/comp" element={<CompHub />} />
            <Route path="/comp/find-partner" element={<CompFindPartner />} />
            <Route path="/comp/register-team" element={<CompRegisterTeam />} />
            <Route path="/comp/leaderboard" element={<CompLeaderboard />} />
            <Route path="/embed/local-comp-leaderboard" element={<EmbedLocalCompLeaderboard />} />
            <Route path="/gift" element={<Gift />} />
            <Route path="/swing-lab" element={<SwingLab />} />
            <Route path="/swing-lab/progress" element={<SwingLabProgress />} />

            {/* Public Marketing Site Routes */}
            <Route path="/about" element={<MarketingAbout />} />
            <Route path="/membership-info" element={<MarketingMembership />} />
            <Route path="/league-info" element={<MarketingLeague />} />
            <Route path="/compete-info" element={<MarketingCompete />} />
            <Route path="/contact" element={<MarketingContact />} />
            <Route path="/faqs" element={<MarketingFAQs />} />
            <Route path="/staffed-hours" element={<MarketingStaffedHours />} />
            <Route path="/gate-access" element={<MarketingGateAccess />} />
            <Route path="/whats-on" element={<MarketingWhatsOn />} />
            <Route path="/coaching" element={<MarketingCoaching />} />
            <Route path="/tpi-assessment" element={<MarketingTPI />} />

            {/* Admin Routes */}
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/timetable" element={<AdminTimetable />} />
            <Route path="/admin/customers" element={<AdminCustomers />} />
            <Route path="/admin/pos" element={<AdminPOS />} />
            <Route path="/admin/bay-control" element={<AdminBayControl />} />
            <Route path="/admin/marketing" element={<AdminMarketing />} />
            <Route path="/admin/announcements" element={<AdminAnnouncements />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/setup-status" element={<AdminSetupStatus />} />
            <Route path="/admin/bulk-email" element={<AdminBulkEmail />} />
            <Route path="/admin/customer-import" element={<AdminCustomerImport />} />
            <Route path="/admin/sgt" element={<AdminSGTManager />} />
            <Route path="/admin/local-comps" element={<AdminLocalComps />} />
            <Route path="/admin/highlights/exports" element={<AdminAllHighlightExports />} />
            <Route path="/admin/highlights/:sessionId/exports" element={<AdminHighlightExports />} />
            <Route path="/admin/highlights/:sessionId/review" element={<AdminHighlightReview />} />
            <Route path="/embed/tv-local-comp" element={<EmbedTVLocalComp />} />
            <Route path="/embed/compete" element={<EmbedCompete />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
