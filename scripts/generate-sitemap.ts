import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Public, indexable website routes only; update when the route table changes.
const BASE_URL = "https://urbanfairways.com.au";
const paths = [
  "/",
  "/about",
  "/membership-info",
  "/league-info",
  "/monthly-winner",
  "/contact",
  "/faqs",
  "/staffed-hours",
  "/gate-access",
  "/whats-on",
  "/coaching",
  "/tpi-assessment",
  "/uf-lab",
  "/gift",
  "/privacy",
];

// Omit lastmod: these routes have no authoritative page-specific change dates.
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...paths.map((path) => `  <url><loc>${BASE_URL}${path}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

writeFileSync(resolve("public/sitemap.xml"), xml);
console.log(`sitemap.xml written (${paths.length} public pages)`);