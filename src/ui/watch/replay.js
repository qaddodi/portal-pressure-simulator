// Judge a pasted history with no browser: replayHistory(history) -> findings (the same ones ?watch showed). Used by the bug packet's Node replay
// and its test-from-packet helper (screen-report plan step 2d), and by tests. Accepts the JSON exportHistory made (or an object, or its text).
import { decodeHistory } from './history.js';
import { judgeMotion, MOTION_RULES } from './motion-rules.js';

/** Every motion rule over `history`; `rules` limits it (rule ids, or rule objects). */
export function replayHistory(history, { rules = null } = {}) {
  const h = decodeHistory(typeof history === 'string' ? JSON.parse(history) : history);
  const list = rules ? MOTION_RULES.filter((r) => rules.some((x) => (x.id || x) === r.id)) : MOTION_RULES;
  return judgeMotion(h, list);
}
