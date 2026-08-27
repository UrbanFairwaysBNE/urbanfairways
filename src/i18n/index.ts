import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enAccount from "./locales/en/account.json";
import enDashboard from "./locales/en/dashboard.json";
import enBooking from "./locales/en/booking.json";
import enMembership from "./locales/en/membership.json";
import enAuth from "./locales/en/auth.json";
import enLab from "./locales/en/lab.json";
import enLeague from "./locales/en/league.json";
import enClubhouse from "./locales/en/clubhouse.json";

import zhCommon from "./locales/zh/common.json";
import zhAccount from "./locales/zh/account.json";
import zhDashboard from "./locales/zh/dashboard.json";
import zhBooking from "./locales/zh/booking.json";
import zhMembership from "./locales/zh/membership.json";
import zhAuth from "./locales/zh/auth.json";
import zhLab from "./locales/zh/lab.json";
import zhLeague from "./locales/zh/league.json";
import zhClubhouse from "./locales/zh/clubhouse.json";

export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "uf_language";

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: "English",
  zh: "中文",
};

export function normaliseLanguage(value: unknown): AppLanguage {
  return value === "zh" ? "zh" : "en";
}

export function getStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return "en";
  try {
    return normaliseLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return "en";
  }
}

export function storeLanguage(lang: AppLanguage) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* ignore private-mode storage errors */
  }
}

const resources = {
  en: {
    common: enCommon,
    account: enAccount,
    dashboard: enDashboard,
    booking: enBooking,
    membership: enMembership,
    auth: enAuth,
    lab: enLab,
    league: enLeague,
    clubhouse: enClubhouse,
  },
  zh: {
    common: zhCommon,
    account: zhAccount,
    dashboard: zhDashboard,
    booking: zhBooking,
    membership: zhMembership,
    auth: zhAuth,
    lab: zhLab,
    league: zhLeague,
    clubhouse: zhClubhouse,
  },
} as const;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: getStoredLanguage(),
    fallbackLng: "en",
    ns: ["common", "account", "dashboard", "booking", "membership", "auth", "lab", "league", "clubhouse"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    react: { useSuspense: false },
  });
}

export function applyLanguage(lang: AppLanguage) {
  if (i18n.language !== lang) {
    i18n.changeLanguage(lang);
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en-AU";
  }
}

export default i18n;
