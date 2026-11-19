// ?testclock: the page starts on the test clock (src/test-clock.js), before any other module of the app has read the time, so every timer
// and frame the app asks for is on it from the first. main.js imports this first; with no ?testclock it does nothing. It runs at real
// pace (rate 1, but driven by a loop a background pane does not throttle) until the figure is up, so the engine's worker and the modules
// have real time to arrive in; main.js then calls pps.testClock (test-mode.js), which links the worker and sets the rate.
import { createTestClock } from '../test-clock.js';
import { flagOn, flagNumber } from './flags.js';

try {
  if (flagOn('testclock')) {
    const asked = flagNumber('testclock') ?? 0;
    const clock = createTestClock(window, { rate: 1, frame: flagNumber('testframe') || 0 });
    clock.wanted = asked >= 1 ? asked : 0;   // (0: test-mode.js's default)
    clock.install(); clock.start();
    window.ppsTestClock = clock;
  }
} catch (e) { console.warn('?testclock: the test clock did not start', e); }
