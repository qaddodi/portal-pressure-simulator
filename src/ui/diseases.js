// Disease names in a teaching card's words get a quiet tinted pill (presenter.js, .pz-dz in app.css). The names come
// from this one list, so a new slide that names one gets the pill with no marking. Conditions and syndromes only:
// the subject itself (portal hypertension) and findings with a tile of their own (ascites, varices) stay plain.
export const DISEASES = ['cardiac cirrhosis', 'cirrhosis', 'cirrhotic', 'portal vein thrombosis', 'splenic vein thrombosis', 'PVT',
  'non-?cirrhotic portal hypertension', 'NCPH', 'schistosomiasis', 'sinusoidal obstruction syndrome', 'SOS', 'Budd[–-]⁠?Chiari(?: syndrome)?',
  'right heart failure', 'heart failure', 'MASLD', 'hepatitis [BC]', 'alcohol-associated hepatitis', 'tricuspid regurgitation', 'constrictive pericarditis',
  'hepatorenal syndrome', 'spontaneous bacterial peritonitis', 'SBP', 'hepatic encephalopathy', 'congestive hepatopathy', 'nodular regenerative hyperplasia',
  'hepatoportal sclerosis', 'hepatic fibrosis', 'hepatocellular carcinoma', 'pancreatitis', 'sarcoidosis', 'primary biliary cholangitis'];

// A name may open a sentence, so its first letter takes either case (an abbreviation keeps its capitals).
const ci = (w) => w.replace(/^([a-z])/, (c) => `[${c}${c.toUpperCase()}]`);
export const DISEASE_SRC = DISEASES.map(ci).join('|');

/** Text split into [string, isDisease] pieces (the names set apart, the rest as it came). */
export function diseasePieces(text) {
  const out = [], re = new RegExp(String.raw`\b(?:${DISEASE_SRC})\b`, 'g');
  let at = 0, m;
  while ((m = re.exec(text))) { if (m.index > at) out.push([text.slice(at, m.index), false]); out.push([m[0], true]); at = m.index + m[0].length; }
  if (at < text.length) out.push([text.slice(at), false]);
  return out;
}
