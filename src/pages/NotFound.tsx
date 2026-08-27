import Seo from "@/components/Seo";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTenant } from "@/config/tenant";

const NotFound = () => {
  const { tenant } = useTenant();
  const location = useLocation();
  const { t } = useTranslation(["clubhouse"]);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <Seo title={`Page Not Found | ${tenant.venue_name}`} description={`The page you are looking for does not exist. Head back to the ${tenant.venue_name} home page.`} path={location.pathname} noindex />
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">{t("clubhouse:notFound.title")}</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("clubhouse:notFound.message")}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t("clubhouse:notFound.returnHome")}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
