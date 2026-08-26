import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import i18n, {
  AppLanguage,
  applyLanguage,
  getStoredLanguage,
  normaliseLanguage,
  storeLanguage,
} from "@/i18n";

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: async () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => getStoredLanguage());

  // Apply the boot language immediately so there is no flash of English.
  useEffect(() => {
    applyLanguage(language);
  }, [language]);

  // Reconcile with the signed-in user's saved preference.
  useEffect(() => {
    let cancelled = false;

    const syncFromProfile = async (userId: string | undefined) => {
      if (!userId) return;
      const { data } = await supabase
        .from("profiles")
        .select("preferred_language")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled || !data) return;

      const stored = getStoredLanguage();
      const remote = normaliseLanguage((data as { preferred_language?: string }).preferred_language);

      if (remote !== stored) {
        // A local choice made while signed out wins and is pushed to the profile.
        if (window.localStorage.getItem("uf_language")) {
          await supabase
            .from("profiles")
            .update({ preferred_language: stored } as never)
            .eq("user_id", userId);
        } else {
          storeLanguage(remote);
          setLanguageState(remote);
        }
      }
    };

    supabase.auth.getSession().then(({ data }) => syncFromProfile(data.session?.user?.id));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => syncFromProfile(session?.user?.id), 0);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setLanguage = useCallback(async (lang: AppLanguage) => {
    storeLanguage(lang);
    setLanguageState(lang);
    applyLanguage(lang);

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (userId) {
      await supabase
        .from("profiles")
        .update({ preferred_language: lang } as never)
        .eq("user_id", userId);
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export { i18n };
