import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";
import birdiesLogo from "@/assets/birdies-logo.png";
import { useTenant, hubUrl } from "@/config/tenant";

const playLinks = [
  { to: "/about", label: "About" },
  { to: "/staffed-hours", label: "Staffed Hours" },
  { to: "/faqs", label: "FAQs" },
];

const topNav = [
  { to: "/compete-info", label: "COMPETE" },
  { to: "/membership-info", label: "JOIN" },
  { to: "/gift", label: "Gift cards" },
  { to: "/whats-on", label: "What's On" },
  { to: "/contact", label: "Contact" },
];

const isPlayActive = (pathname: string) =>
  playLinks.some((l) => l.to === pathname);

const SiteHeader = () => {
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);
  const [mobilePlayOpen, setMobilePlayOpen] = useState(false);
  const playRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
    setPlayOpen(false);
    setMobilePlayOpen(false);
  }, [pathname]);


  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close PLAY dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (playRef.current && !playRef.current.contains(e.target as Node)) {
        setPlayOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-primary text-primary-foreground shadow-sm">
      {/* Top announcement bar */}
      <div className="bg-accent text-accent-foreground text-center text-xs sm:text-sm py-2 px-4 font-bold uppercase tracking-wide">
        <Link to="/staffed-hours" className="hover:underline">Click Here For Staffed Hours</Link>
        {tenant.support_phone && (
          <>
            {" | "}
            <a href={`tel:${tenant.support_phone.replace(/\s+/g, "")}`} className="hover:underline">{tenant.support_phone}</a>
          </>
        )}
      </div>

      <div className="container mx-auto flex items-center justify-between py-3 px-4 gap-3">
        {/* Mobile/tablet: burger on the left */}
        <button
          className="lg:hidden p-2 -ml-2 order-first"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        <Link to="/" className="flex items-center gap-2 lg:order-first">
          <img src={birdiesLogo} alt={`${tenant.venue_name}, Indoor Golf Redefined`} className="h-10 sm:h-12" />
        </Link>

        {/* Desktop: full nav */}
        <nav className="hidden lg:flex items-center gap-6 xl:gap-7">
          {/* PLAY dropdown */}
          <div ref={playRef} className="relative">
            <button
              onClick={() => setPlayOpen((p) => !p)}
              className={`font-display tracking-wide text-sm uppercase transition-colors whitespace-nowrap flex items-center gap-1 ${
                isPlayActive(pathname) ? "text-accent" : "text-primary-foreground hover:text-accent"
              }`}
            >
              PLAY <ChevronDown className={`h-3.5 w-3.5 transition-transform ${playOpen ? "rotate-180" : ""}`} />
            </button>
            {playOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-primary border border-primary-foreground/10 rounded-md shadow-xl py-1 z-50">
                {playLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className={`block px-4 py-2.5 text-sm font-display tracking-wide uppercase transition-colors ${
                      pathname === l.to ? "text-accent" : "text-primary-foreground hover:text-accent"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {topNav.map((n) => {
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`font-display tracking-wide text-sm uppercase transition-colors whitespace-nowrap ${
                  active ? "text-accent" : "text-primary-foreground hover:text-accent"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
          <a
            href={hubUrl(tenant, "/")}
            className="ml-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide text-sm uppercase px-5 py-2.5 rounded-md transition-colors whitespace-nowrap"
          >
            Book Now
          </a>
        </nav>

        {/* Mobile/tablet: spacer to balance burger so logo stays roughly centered */}
        <div className="lg:hidden w-10" aria-hidden="true" />
      </div>

      {/* Mobile/tablet left-side drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-[60] transition ${
          open ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        {/* Panel */}
        <aside
          className={`absolute left-0 top-0 h-full w-72 max-w-[85%] bg-primary text-primary-foreground shadow-xl transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary-foreground/10">
            <img src={birdiesLogo} alt={tenant.venue_name} className="h-10" />
            <button
              className="p-2 -mr-2"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex flex-col px-4 py-4 gap-1">
            {/* PLAY expandable */}
            <div>
              <button
                onClick={() => setMobilePlayOpen((p) => !p)}
                className={`w-full flex items-center justify-between font-display tracking-wide uppercase py-3 border-b border-primary-foreground/10 ${
                  isPlayActive(pathname) ? "text-accent" : "text-primary-foreground"
                }`}
              >
                <span>PLAY</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${mobilePlayOpen ? "rotate-180" : ""}`} />
              </button>
              {mobilePlayOpen && (
                <div className="pl-4 flex flex-col gap-1">
                  {playLinks.map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      className={`font-display tracking-wide uppercase py-2 text-sm ${
                        pathname === l.to ? "text-accent" : "text-primary-foreground/80"
                      }`}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>


            {topNav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`font-display tracking-wide uppercase py-3 border-b border-primary-foreground/10 ${
                  pathname === n.to ? "text-accent" : "text-primary-foreground"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <a
              href={hubUrl(tenant, "/")}
              className="mt-4 bg-accent text-accent-foreground font-display tracking-wide uppercase text-center px-5 py-3 rounded-md"
            >
              Book Now
            </a>
          </nav>
        </aside>
      </div>
    </header>
  );
};

export default SiteHeader;
