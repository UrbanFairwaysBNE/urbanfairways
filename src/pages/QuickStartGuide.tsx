import { useEffect } from "react";
import { useTenant } from "@/config/tenant";

export default function QuickStartGuide() {
  const { tenant } = useTenant();
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  return (
    <iframe
      src="/quick-start-guide.html"
      className="w-full h-screen border-0"
      title={`Quick Start Guide for ${tenant.venue_name}`}
    />
  );
}
