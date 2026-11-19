// Shared links (SHL-7, bible review 19 Nov 2026: out of main.js, which no test ran): the code a link carries, reading it back, loading a shared scenario, the link back to where a
// page was (the preview pill's reload, a feedback report) and Copy link. createShare takes what they act on and the page's own location, history and clipboard (`env`), so
// tests/share-flow.test.js runs them with a fake page.
import { parseShare, cleanShare, encodeShare as encodeShareCode } from './share-link.js';
import { deepMerge, sanitizeParamsReport } from '../engine/portal/scenario.js';

/**
 * @param { store: any, presenter: any, stage: any, timeline: any, loadPreset: Function, updateParams: Function, setViewKey: Function, toast: Function,
 *   env: { location: any, history: any, clipboard: any, open: Function, embed: boolean, search: () => string } } d  (stage and timeline are read when used: the page makes them at boot)
 */
export function createShare(d) {
  const { store, env, toast } = d;
  function encodeShare(extra) {
    const st = store.get();
    const payload = { v: 1, preset: st.presetId, params: st.params, view: st.view, ...extra };
    return encodeShareCode(payload);
  }
  // (Read through share-link.js: prototype keys dropped, and only a known patient, view, selection and a finite camera kept.)
  function readShare() {
    const m = env.location.hash.match(/#s=([\w-]+)/);
    return m ? cleanShare(parseShare(m[1]), store.get().presetList?.map((p) => p.id)) : null;
  }
  async function loadShared(s, { quiet = false } = {}) {
    // B1: a load that was replaced (another patient tapped meanwhile) or failed must not take this link's settings.
    if (!(await d.loadPreset(s.preset))) return false;
    let clamped = false, repaired = '';
    const missing = s.missing && `This link names a patient the app does not have (“${s.missing}”), so its settings opened on the healthy patient.`;
    // (A patient made from readings, "Yours", is saved on its owner's device only: a link made from one carries the settings, and says so.)
    if (s.fromYours) toast('This link comes from a patient made from readings, which is saved on the sender’s device only, so its settings opened on the healthy patient.', 'bad');
    if (s.params) {
      const merged = deepMerge(store.get().params, s.params), { params: clean, repairs } = sanitizeParamsReport(merged);
      d.updateParams(() => clean, { settle: true, history: false });
      // (R07: a value that is not what its field takes is replaced and named, never read as "on": the first few field paths are in the toast.)
      if (repairs.length) repaired = repairs.slice(0, 3).map((r) => r.path || 'the settings').join(', ') + (repairs.length > 3 ? ` and ${repairs.length - 3} more` : '');
      if (JSON.stringify(clean) !== JSON.stringify(merged)) { d.timeline.flush(); clamped = true; }   // (the view, selection and camera of the link still apply)
    }
    if (s.view && s.view !== store.get().view) d.setViewKey(s.view === 'circuit' ? 'circuit' : 'anatomy');   // (the link's view, through the one writer: a link made inside the lobule or sinusoid carries the anatomy's)
    if (s.sel) store.set({ selection: s.sel });
    if (s.cam && !store.get().lobule) d.stage.setCamera(s.cam, 0);
    d.timeline.flush();
    if (clamped) toast(missing || `This link had values the model does not accept${repaired ? ` (${repaired})` : ''}; they were set to the nearest allowed value or the default.`, missing ? 'bad' : undefined);
    else if (missing) toast(missing, 'bad');
    else if (!quiet) toast('Loaded the shared scenario.');
    return true;
  }
  // The orange PREVIEW pill reloads onto the newest build and calls this first: a URL for the same place. In Present, the same
  // presentation and slide (?script=&slide=); in Patients, the same patient, settings, view, camera and selection (#s=).
  // "back" tells the next load to land there quietly: no case card, no "shared scenario" toast.
  function resumeUrl() {
    const u = new URL(env.location.href), pos = d.presenter.position();
    for (const k of ['script', 'slide', 'preset', 'home']) u.searchParams.delete(k);
    u.searchParams.set('back', '1');
    if (pos) { u.searchParams.set('script', pos.id); u.searchParams.set('slide', String(pos.at + 1)); u.hash = ''; }
    else { const st = store.get(); u.hash = `#s=${encodeShare({ sel: st.selection || undefined, cam: st.lobule ? undefined : d.stage.cameraState() })}`; }
    return u.href;
  }
  async function share() {
    // On the hosted site a built-in patient's link goes through its share page (c/<id>.html, written at deploy
    // by scripts/share-pages.mjs), so iMessage or Slack previews show the patient's name.
    const id = store.get().presetId, page = env.location.hostname.endsWith('github.io') && store.get().presetList?.some((p) => p.id === id);
    const url = `${page ? new URL(`c/${id}.html`, env.location.href).href : env.location.origin + env.location.pathname}#s=${encodeShare()}`;
    try { await env.clipboard.writeText(url); toast('Link to this exact scenario copied.'); } catch {
      // (An embedded copy has no address bar of its own to put the link in: the link opens the full app in a tab, where it is in the address bar to copy, SHL-5.)
      if (env.embed) { env.open(url, '_blank', 'noopener'); toast('Link opened in a new tab: copy it from the address bar.'); return; }
      env.history.replaceState(null, '', env.location.pathname + env.search() + `#s=${encodeShare()}`); toast('Link placed in the address bar.');
    }   // (the page's own path: a share page's /c/ path would make every later link /c/c/…)
  }

  return { encodeShare, readShare, loadShared, resumeUrl, share };
}
