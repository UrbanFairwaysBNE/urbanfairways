# SGT Manager — align with the latest handover

I compared the handover file against this project. The core stack (19 `sgt-*` functions, all admin tabs, handicap rules, prizes, embeds) is already here. Five things are genuinely missing or out of step.

## Confirmed gaps

1. **No SGT scheduled jobs exist at all.** The database currently has only three cron jobs (door codes, pack expiry, promo email). None of the league jobs from the handover are scheduled — no API key refresh, no 4-hourly sync, no auto-register, no handicap recalc, no cleanup, no winner reminders. Right now nothing SGT-related runs automatically.
2. **Nicknames are not implemented.** `sgt_tour_members.nickname` does not exist, and there is no `useSgtNicknames` hook, so leaderboards, embeds and TV boards can only show SGT usernames.
3. **Pending Onboarding cannot be dismissed.** `profiles.sgt_onboarding_dismissed_at` / `_by` do not exist, so a pending player reappears in the queue forever.
4. **`sgt_user_id` is not unique.** It has a plain index only, so two profiles could claim the same SGT account — the exact collision the handover warns about.
5. **Editing a handicap does not re-register the player.** The Members tab writes `custom_hcp` but never de-registers/re-registers for the live tour and tournament, so SGT keeps the old number for the rest of the week.

## Proposed work

**Database**
- Add `nickname` to `sgt_tour_members`; add `sgt_onboarding_dismissed_at` / `sgt_onboarding_dismissed_by` to `profiles`.
- Replace the plain `sgt_user_id` index with a unique partial index (nulls allowed), after checking for existing duplicates.
- Add the `local_comp_first_timer_flags(p_competition_id)` function (debut pairing + net-vs-par flag) used by the Ambrose recap.
- All new objects follow GRANT → RLS → policy order.

**Scheduling** — create the full job set, converted to Brisbane (UTC+10, no DST):
API key refresh 04:00, eligible sync 05:00, regular sync every 4h, course sync 06:00, tournament auto-register 06:00, handicap recalc Mon 06:00, cleanup 1st at 03:00, weekly winner reminder Mon 09:00, monthly reminder 1st at 10:00. Highlight pollers stay off while highlights are disabled.

**Behaviour**
- Members tab: saving a handicap triggers de-register + re-register via `sgt-auto-register`, with a toast, so SGT holds the new number immediately.
- Hold the welcome/onboarding email until an admin sets `custom_hcp` — never send a "Combo (auto)" handicap.
- Pending Onboarding: add a Dismiss action writing the new dismissal columns and filter dismissed players out of the queue.
- Members 3-dot menu gains **Nickname**; add a `useSgtNicknames` hook and render nicknames in `LeagueLeaderboard`, `EmbedLeaderboard`, `EmbedCompete`, `TournamentStatsView`, `EmbedTVStatsBase`.

## One decision to confirm

The handover says players are exempt for **3** rounds. This project deliberately uses **4** (`TRUE_HCP_ROUNDS = 4`) because tournament weeks are two rounds long, so a player crossing three mid-week would still finish round 4 on their onboarding handicap. I'll **keep 4** unless you tell me to match the handover's 3.

## Out of scope

Video highlights (`HIGHLIGHTS_ENABLED` is off here) and the Ambrose GSPro screenshot OCR functions (`ingest-comp-scorecard`, `parse-comp-scorecard`) are in the handover but not in this project. Say the word and I'll add either.
