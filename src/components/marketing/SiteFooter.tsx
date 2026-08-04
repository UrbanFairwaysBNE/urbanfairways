import { Phone, Mail, MapPin, Facebook, Instagram } from "lucide-react";
import venueLogo from "@/assets/venue-logo.png";
import googlePlayBadge from "@/assets/google-play-badge.svg";
import { useTenant, hubUrl, formatTenantAddress } from "@/config/tenant";

const APP_STORE_BADGE_URL =
  "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/white/en-au?size=250x83";

const SiteFooter = () => {
  const { tenant } = useTenant();
  return (
    <footer className="bg-primary text-primary-foreground mt-20">
      <div className="container mx-auto px-4 py-14 grid gap-10 md:grid-cols-3">
        <div>
          <img src={venueLogo} alt={tenant.venue_name} className="h-14 mb-4" />
          <p className="text-primary-foreground/70 text-sm leading-relaxed">
            {tenant.venue_name}, an indoor golf centre. Play, practice and compete, rain or shine.
          </p>
          <div className="flex gap-3 mt-5">
            {tenant.socials.facebook && (
              <a
                href={tenant.socials.facebook}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
                className="bg-primary-foreground/10 hover:bg-accent transition-colors p-2 rounded-full"
              >
                <Facebook className="h-4 w-4" />
              </a>
            )}
            {tenant.socials.instagram && (
              <a
                href={tenant.socials.instagram}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="bg-primary-foreground/10 hover:bg-accent transition-colors p-2 rounded-full"
              >
                <Instagram className="h-4 w-4" />
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <a
              href={tenant.socials?.ios_app_url || "#"}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={APP_STORE_BADGE_URL}
                alt={`Download ${tenant.venue_name} Hub on the App Store`}
                className="h-10 w-auto"
              />
            </a>
            <a
              href={tenant.socials?.android_app_url || "#"}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={googlePlayBadge}
                alt={`Get ${tenant.venue_name} Hub on Google Play`}
                className="h-10 w-auto"
              />
            </a>
          </div>
        </div>

        <div>
          <h3 className="font-display tracking-wide uppercase text-accent mb-4">Visit</h3>
          <ul className="space-y-3 text-sm text-primary-foreground/85">
            {formatTenantAddress(tenant) && (
              <li className="flex gap-3"><MapPin className="h-4 w-4 mt-0.5 shrink-0 text-accent" /><span>{formatTenantAddress(tenant)}</span></li>
            )}
            {tenant.support_phone && (
              <li className="flex gap-3"><Phone className="h-4 w-4 mt-0.5 shrink-0 text-accent" /><a href={`tel:${tenant.support_phone.replace(/\s+/g, "")}`} className="hover:text-accent">{tenant.support_phone}</a></li>
            )}
            <li className="flex gap-3"><Mail className="h-4 w-4 mt-0.5 shrink-0 text-accent" /><a href={`mailto:${tenant.support_email}`} className="hover:text-accent">{tenant.support_email}</a></li>
          </ul>
        </div>

        <div>
          <h3 className="font-display tracking-wide uppercase text-accent mb-4">Play</h3>
          <p className="text-sm text-primary-foreground/85 mb-4">
            Book and manage your sessions, become a member, all in the {tenant.venue_name} Hub.
          </p>
          <a
            href={hubUrl(tenant, "/")}
            className="inline-block bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase text-sm px-5 py-2.5 rounded-md"
          >
            Open The Hub
          </a>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10">
        <div className="container mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between text-xs text-primary-foreground/60 gap-2">
          <p>© {new Date().getFullYear()} {tenant.venue_name}. All rights reserved.</p>
          <p>Indoor Golf, Redefined.</p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
