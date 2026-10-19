import { loadLiveVersions, loadLiveDatasets } from "./api";
import { planSync, applySync, saveLive } from "./live";

/**
 * Bring this phone's copies of what PORs publish up to date.
 *
 * Asks for version numbers first and downloads only the datasets whose number
 * has moved, so an open on which nothing changed costs a few hundred bytes.
 * Pass `versions` when the list has already been fetched alongside something
 * else, as boot does.
 *
 * Throws if a request fails, and changes nothing when it does: what the phone
 * already holds stays, which is the right answer when the server can't be
 * reached, and also before supabase/por-dashboard.sql has been run at all.
 */
export async function syncLive(versions, {
  // Swappable so the tests can make each request fail; the app never passes these.
  loadVersions = loadLiveVersions, loadDatasets = loadLiveDatasets, storage,
} = {}) {
  const list = versions ?? await loadVersions();
  const { fetch, drop } = planSync(list);
  const rows = fetch.length ? await loadDatasets(fetch) : [];
  applySync({ rows, drop });
  if (fetch.length || drop.length) saveLive(storage);
}
