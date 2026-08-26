import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Languages } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { AppLanguage, LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from "@/i18n";

export function LanguageCard() {
  const { t } = useTranslation(["account"]);
  const { language, setLanguage } = useLanguage();

  const handleSelect = async (lang: AppLanguage) => {
    if (lang === language) return;
    await setLanguage(lang);
    toast.success(t("account:languageUpdated"));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Languages className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle>{t("account:language")} / 语言</CardTitle>
            <CardDescription>{t("account:languageDesc")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const active = lang === language;
          return (
            <button
              key={lang}
              type="button"
              onClick={() => handleSelect(lang)}
              aria-pressed={active}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all active:scale-[0.98] ${
                active
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-accent/50"
              }`}
            >
              <span className="font-medium">{LANGUAGE_LABELS[lang]}</span>
              {active && <Check className="h-4 w-4 text-accent" />}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
