import { Helmet } from "react-helmet-async";
import { useTenant, bookingUrl } from "@/config/tenant";

interface SeoProps {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}

/**
 * Per-route head tags: unique title, description and self-referencing canonical.
 */
const Seo = ({ title, description, path, noindex }: SeoProps) => {
  const { tenant } = useTenant();
  const url = bookingUrl(tenant, path);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
    </Helmet>
  );
};

export default Seo;
