import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2 } from "lucide-react";
import birdiesLogo from "@/assets/birdies-green-logo.png";
import { useTenant, formatTenantAddress } from "@/config/tenant";

const dayOptions = ["Monday", "Wednesday", "Thursday"];
const timeOptions = ["6:00 PM", "7:00 PM", "8:00 PM"];
const feeOptions = [
  { value: "$20", label: "$20 ($10 each)", detail: "Avg Prize: $100" },
  { value: "$30", label: "$30 ($15 each)", detail: "Avg Prize: $150" },
  { value: "$40", label: "$40 ($20 each)", detail: "Avg Prize: $200" },
];

export default function CompSurvey() {
  const { tenant } = useTenant();
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get("email") || "";

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedFee, setSelectedFee] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedDay || !selectedTime || !selectedFee) return;
    setSubmitting(true);
    try {
      await supabase.from("comp_survey_responses" as any).insert({
        email: emailParam || null,
        name: name || null,
        preferred_day: selectedDay,
        preferred_time: selectedTime,
        preferred_entry_fee: selectedFee,
      } as any);
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FFF5E4] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <img src={birdiesLogo} alt={tenant.venue_name} className="h-14 mx-auto" />
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#1F4C25]/10">
            <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[#1F4C25] mb-2">Thanks for your input!</h1>
            <p className="text-[#1F4C25]/70">
              We really appreciate you helping us shape the Ambrose Comp. Stay tuned for the launch! ⛳
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF5E4] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <img src={birdiesLogo} alt={tenant.venue_name} className="h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#1F4C25]">Weekly Ambrose Comp</h1>
          <p className="text-[#1F4C25]/70 mt-1">Help us pick the best format, choose your preferences below</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#1F4C25]/10 space-y-6">
          {/* Day Selection */}
          <div>
            <label className="block text-sm font-medium text-[#1F4C25] mb-3">
              What day works best?
            </label>
            <div className="flex flex-col gap-2">
              {dayOptions.map((day) => (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all font-medium ${
                    selectedDay === day
                      ? "border-[#1F4C25] bg-[#1F4C25]/5 text-[#1F4C25]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Time Selection */}
          <div>
            <label className="block text-sm font-medium text-[#1F4C25] mb-3">
              What time suits you?
            </label>
            <div className="flex flex-col gap-2">
              {timeOptions.map((time) => (
                <button
                  key={time}
                  onClick={() => setSelectedTime(time)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all font-medium ${
                    selectedTime === time
                      ? "border-[#1F4C25] bg-[#1F4C25]/5 text-[#1F4C25]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>

          {/* Entry Fee Selection */}
          <div>
            <label className="block text-sm font-medium text-[#1F4C25] mb-3">
              Preferred entry fee per team of 2?
            </label>
            <div className="flex flex-col gap-2">
              {feeOptions.map((fee) => (
                <button
                  key={fee.value}
                  onClick={() => setSelectedFee(fee.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                    selectedFee === fee.value
                      ? "border-[#EC622D] bg-[#EC622D]/5 text-[#1F4C25]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <span className="font-semibold">{fee.label}</span>
                  <span className="block text-sm text-[#EC622D] mt-0.5">{fee.detail}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[#1F4C25] mb-1.5">
              Your name <span className="text-[#1F4C25]/40">(optional)</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="border-[#1F4C25]/15 focus:border-[#1F4C25]/30"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!selectedDay || !selectedTime || !selectedFee || submitting}
            className="w-full bg-[#EC622D] hover:bg-[#d4551f] text-white font-semibold py-3 rounded-xl text-base"
          >
            {submitting ? "Sending..." : "Submit Preferences"}
          </Button>
        </div>

        <p className="text-center text-xs text-[#1F4C25]/40">
          {tenant.venue_name} · {formatTenantAddress(tenant)}
        </p>
      </div>
    </div>
  );
}
