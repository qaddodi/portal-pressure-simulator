# Guidelines the talks cite

Kept here so every statement number in `src/ui/decks/` can be checked against the source. They are not part of the built site.

- `baveno-viii-2026.pdf`: Baveno VIII Faculty, *Baveno VIII – Advancing consensus in portal hypertension*, Journal of Hepatology 2026 (the statements cited as "Baveno VIII x.y").
- `aasld-2024-portal-hypertension.pdf`: Kaplan et al., *AASLD Practice Guidance on risk stratification and management of portal hypertension and varices in cirrhosis*, Hepatology 2024 (cited as "AASLD 2024").
- `trials.md`: the landmark trials the trial card shows (`tool: { kind: 'trial' }`), with what was read from each abstract and a status; `src/ui/trials.js` holds the same list and `tests/trials.test.js` keeps the two in step.

## Asked for, not in the folder yet

Both were asked for on 8 Nov 2026. The cloud sandbox that builds the app cannot reach PubMed, EASL or the journals' sites, so the PDFs have to be added by hand. Until they are here, a statement cited to either one cannot be checked against a file in the folder, so say in the deck's notes that it was not.

- `easl-2025-vascular-liver-diseases.pdf`: EASL Clinical Practice Guidelines on vascular diseases of the liver, Journal of Hepatology 2025 (to be cited as "EASL 2025").
- `aasld-2021-ascites.pdf`: Biggins et al., *Diagnosis, evaluation, and management of ascites, spontaneous bacterial peritonitis and hepatorenal syndrome: 2021 practice guidance by the AASLD*, Hepatology 2021 (to be cited as "AASLD 2021").

When a file is added, move its line up into the list above and say what it is cited as.
