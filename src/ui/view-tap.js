// The view switch's second press (17 Nov 2026, Mohammad: "when I hit anatomy while in anatomy view or lobule while in lobule view etc the
// view should fit zoom"). Pure: whether a press of a view's button is a second one, because its view is the one showing now.
// The Sinusoid is one level further in (its own button steps in or out), and while it is open the Lobule button steps back out to the lobule,
// so neither counts. main.js asks this before any view button does its own work and answers a second press with stage.fitAgain()
// (stage-fit.js): one rule for the Circuit, the Anatomy and the Lobule.

/** `view`: the button's data-view ('circuit', 'anatomic', 'lobule', 'sinusoid'); `st`: the store's state ({ lobule, sinusoid, view }). */
export function viewTapAgain(view, st) {
  if (!st || st.sinusoid) return false;
  if (view === 'lobule') return !!st.lobule;
  if (st.lobule) return false;
  if (view === 'circuit') return st.view === 'circuit';
  if (view === 'anatomic') return st.view !== 'circuit';
  return false;
}
