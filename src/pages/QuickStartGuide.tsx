import { useEffect } from "react";
import { useTenant } from "@/config/tenant";

export default function BirdiesGuide() {
  const { tenant } = useTenant();
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  return (
    <iframe
      src="/birdies-guide.html"
      className="w-full h-screen border-0"
      title={`How to Use ${tenant.venue_name} Guide`}
    />
  );
}
