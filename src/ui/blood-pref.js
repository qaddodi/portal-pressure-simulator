// The saved choice of the moving blood (the Blood menu), read once at start-up. The chevrons are the only mark of moving blood: the Streaks option was removed on
// 16 Nov 2026 (Mohammad), and a device may still carry what it saved.
//   pps.blood2    the Blood menu's choice ({ chevrons, keyChevrons, phasic, ... }); chevrons became the default under this key, so an older key starts over.
//   pps.streaks   the removed option's own key ('1' on, '0' off). Dropped here. A device that had the streaks ON ('1') still had moving blood drawn, so its chevrons
//                 come on (the chevron default) even if it had switched them off; one that had them off ('0') keeps whatever it chose for the chevrons.
// `storage` is localStorage (or a stand-in); any read or write that throws leaves the defaults.
import { caught } from './caught.js';

/** The chevron default, plus whatever the device saved, with the dead keys (origin, look) dropped; pps.streaks migrated and removed. Returns the store's `blood`. */
export function loadBloodPref(storage) {
  let saved = null;
  try { saved = JSON.parse(storage.getItem('pps.blood2') || 'null'); } catch (e) { caught('blood-pref:read', e); /* storage unavailable or not JSON */ }
  const blood = { phasic: false, chevrons: true, ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}) };
  delete blood.origin;   // (now the Blood origin lens)
  delete blood.look;     // (the streaks' look)
  blood.phasic = false;
  try {
    const was = storage.getItem('pps.streaks');
    if (was !== null && was !== undefined) {
      if (was === '1') blood.chevrons = true;
      storage.removeItem('pps.streaks');
      storage.setItem('pps.blood2', JSON.stringify(blood));
    }
  } catch (e) { caught('blood-pref:streaks', e); /* storage unavailable */ }
  return blood;
}
