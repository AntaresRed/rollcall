import { supabase } from "./supabase";

/**
 * Count one use of a feature — see supabase/feature-events.sql.
 *
 * Fire and forget. Nothing waits on it and nothing reports its failure:
 * a lost count costs a statistic, while a tap that stalled or showed an error
 * because a counter didn't save would cost the student something they came
 * for. Offline taps are simply not counted.
 *
 * No user id is sent, and the table would not take one. The server stamps
 * the cohort and the time itself.
 *
 * Not imported by SignIn or InstallBanner, which must not pull in the
 * Supabase client — and a signed-out student has nothing to count anyway.
 */
export function track(event, detail = null) {
  // Local development would otherwise count the developer's own clicking
  // into the live table.
  if (import.meta.env.DEV) return;
  try {
    supabase.from("feature_events").insert({ event, detail }).then(
      () => {}, () => {},
    );
  } catch {
    /* uncounted, and nothing else is affected */
  }
}
