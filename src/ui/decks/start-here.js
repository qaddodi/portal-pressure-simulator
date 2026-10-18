// Presenter talk: a short tour for a first-time user, first in the Present menu and offered by the first-run hint
// (the slide fields are described at the top of decks.js).

export const START_HERE = {
  id: 'start-here', level: 'foundation', title: 'How to use the simulator', minutes: 3,
  summary: 'A short tour for a first visit: what the figure shows, how to change it, the two ways to use the app and how to send feedback.',
  objectives: ['Read the vessel colors and the pressure labels', 'Change the model and watch every number follow', 'Choose between a talk and a patient to explore', 'Send feedback on anything that looks wrong'],
  slides: [
    {
      id: 'figure', preset: 'healthy', cam: 'fit', labels: ['CONF', 'RA'],
      kicker: 'The figure', title: 'A live model of the portal circulation',
      line: 'The figure runs from the gut to the heart. Each vein’s color shows its pressure, the labels give it in mmHg, and the moving streaks are the blood. Every number is computed as you watch.',
      notes: 'The figure is one hemodynamic model of the splanchnic, portal, hepatic and systemic veins with the heart. Nothing is drawn by hand for a slide: the colors, labels, streaks and tiles all read the model as it runs. This patient is healthy, so every vein is pale and the pressures are low.',
    },
    {
      id: 'change', preset: 'csph', cam: 'fit', labels: ['CONF', 'RA'], data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg'],
      compare: [{ label: 'Healthy', preset: 'healthy' }, { label: 'Cirrhosis', own: true }],
      kicker: 'Changing it', title: 'Change one thing and every number follows',
      line: 'Scarring in the liver raises its resistance, and the pressure rises in every vein upstream. Tap Healthy and Cirrhosis to switch the same figure between the two, and watch the colors, labels and tiles move together.',
      notes: 'The buttons ease the live model between a healthy patient and clinically significant portal hypertension. Each tile is a scale bar: colored bands at the clinical cut-offs and a dot for the reading now. HVPG is the wedged minus the free hepatic vein pressure; PPG is the portal vein minus the IVC.',
    },
    {
      id: 'drag', cam: 'fit', labels: ['CONF', 'RA'], data: 'tiles', tiles: ['hvpg', 'ppg'],
      whatIf: { label: 'Scarring', param: 'cirrhosis', min: 0, max: 1, step: 0.05, ends: ['None', 'Severe'] },
      kicker: 'Changing it', title: 'Drag the slider and watch the pressures move',
      line: 'The slider sets how scarred the liver is. Drag it and the vessel colors, the labels and the tiles follow at once, because the model recomputes every pressure as the resistance changes.',
      notes: 'The slider drags one parameter of the live model, the severity of cirrhosis, from none to severe. Pressures follow within a heartbeat or two. Changes that take months in patients, such as varices growing and collaterals remodeling, run on the disease clock instead: the timeline in Patients moves it forward.',
    },
    {
      id: 'colors', cam: 'fit',
      compare: [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Flow', lens: 'flow' }, { label: 'Direction', lens: 'direction' }, { label: 'Origin', lens: 'origin' }],
      kicker: 'Changing it', title: 'Color the vessels by a different question',
      line: 'The same vessels can show how high the pressure is, how much blood flows, which way it goes and where it comes from. Tap each button. In Patients, the color menu at the top offers more.',
      notes: 'Each button recolors the same figure without changing the model. Direction shows reversed flow in orange, which is how a hepatofugal portal vein or a reversed collateral stands out. Origin colors the blood by its source, mixed by flow at each junction. Talks pick the coloring that answers their question, and the key on the figure names it.',
    },
    {
      id: 'modes', cam: 'fit',
      kicker: 'Using the app', title: 'Two ways in: Present and Patients',
      line: 'Present plays talks like this one. Patients lets you explore freely: tap a vessel or an organ to change it, then use Treat, Tests and Search. Switch between them in the menu under the patient’s name at the top left.',
      notes: 'Present holds the talks, grouped from foundations to treatment, each with an outline, its own patients and a closing quick check. Patients holds the built-in cases, from healthy to Budd–Chiari. In Patients, a vessel or organ card lists what can be done there, Treat holds the treatments, Tests the instruments and Search finds anything by name.',
    },
    {
      id: 'feedback', cam: 'fit',
      kicker: 'Using the app', title: 'Move through a talk and report what you find',
      line: 'Use the arrows, the arrow keys or a swipe to change slides. If anything looks wrong, open Settings (the gear) and choose Send feedback: it starts an email with a link to that exact view.',
      notes: 'Send feedback, at the top of Settings, opens a draft in your own email app, with the build, the device, the screen size and a link back to the view you were on. Write what happened and what you expected, then send it yourself; the app sends nothing on its own. After about ten minutes of use the app also asks once whether anything looked wrong. A screenshot with the orange PREVIEW pill showing helps too.',
    },
  ],
};
