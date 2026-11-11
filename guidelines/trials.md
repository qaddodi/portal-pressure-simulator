# Trials the talks cite

The trial list behind the trial card (`tool: { kind: 'trial', id }`, `src/ui/trials.js`). Every number on a card is the published abstract's own
whole percent or effect size; none is rounded or worked out. `tests/trials.test.js` fails a trial in `src/ui/trials.js` that has no section
here, a status that differs, a rate that is not a whole percent from 0 to 100, and a slide that names a trial this file does not list.

Each section is `## <id>`, the citation, the PMID, what was read and from where, and a `Status:` line. `checked` means every number on the card
was read in the trial's abstract (PubMed text, the publisher's abstract page or a journal's own summary of it) on 11 Nov 2026. `unchecked`
means it was not; the card then says "Not yet checked against the paper". A PMID is given only where a PubMed address was seen.

What the card does not claim: follow-up, setting and caveat lines are the abstract's words or the guideline reference lists' titles, kept short.
Where an abstract did not give a field, the field is left out of `src/ui/trials.js`, not filled from memory.

## predesci
Villanueva C, et al. Lancet 2019. Beta-blockers to prevent decompensation of cirrhosis in patients with clinically significant portal hypertension (PREDESCI).
PMID 30910320. In the AASLD 2024 reference list.
Read: 201 randomized (100 beta-blocker, 101 placebo); decompensation or death 16% (16 of 100) against 27% (27 of 101); HR 0.51 (95% CI 0.26–0.97), p = 0.041; median follow-up 37 months (IQR 27–47). Read in the PubMed abstract (via the University of Bern repository copy) and a journal-club PDF of the paper.
Status: checked

## earlytips
García-Pagán JC, et al. N Engl J Med 2010. Early use of TIPS in patients with cirrhosis and variceal bleeding.
PMID: not looked up.
Read: 63 randomized (32 early TIPS, 31 drug therapy plus endoscopic band ligation); median follow-up 16 months; 1-year survival 86% against 61% (P < 0.001); 1-year freedom from rebleeding or failure to control bleeding 97% against 50% (P = 0.001). Read on the University of Barcelona repository copy of the abstract.
Status: checked

## lvtips
Lv Y, et al. Lancet Gastroenterol Hepatol 2019;4(8):587–598. Early TIPS with covered stents versus standard treatment for acute variceal bleeding in patients with advanced cirrhosis.
PMID 31153882 (from the address the abstract was read at).
Read: 132 randomized (86 early TIPS, 46 control; 84 and 45 analyzed); Child-Pugh B or C; 1-year transplant-free survival 86% (95% CI 79–94) against 73% (62–88), HR 0.50 (0.25–0.98), p = 0.04. The abstract text read gives no median follow-up, so the card says "1 year", the time of the outcome.
Status: checked

## transfusion
Villanueva C, et al. N Engl J Med 2013;368(1):11–21. Transfusion strategies for acute upper gastrointestinal bleeding.
PMID 23281973.
Read: restrictive strategy (transfuse at hemoglobin below 7 g/dL) against liberal (below 9 g/dL); survival at 6 weeks 95% against 91%; HR for death 0.55 (0.33–0.92), P = 0.02; among patients with cirrhosis, a lower death rate with the restrictive strategy in Child-Pugh A and B, none in C, and no significant difference when all of them were analyzed together. Read in a summary of the abstract (WikEM). 921 randomized is the figure the deck thread read in the abstract; the summary page did not give the number, so this one number is second-hand.
Status: checked

## rifaximin
Bureau C, et al. Ann Intern Med 2021. Rifaximin for the prevention of overt hepatic encephalopathy after TIPS.
PMID 33524293.
Read: 197 randomized, 194 treated, 186 had a TIPS placed (93 in each arm); rifaximin or placebo from 14 days before the TIPS to 168 days after; overt encephalopathy within 168 days 34% (95% CI 25–44) against 53% (43–63); OR 0.48 (0.27–0.87). Read in the PubMed abstract text and the ACP Gastroenterology Monthly summary of it.
Status: checked

## covered
Bureau C, et al. Gastroenterology 2017. Transjugular intrahepatic portosystemic shunts with covered stents increase transplant-free survival of patients with cirrhosis and recurrent ascites.
PMID 27663604.
Read: 62 randomized (29 covered TIPS, 33 large-volume paracentesis with albumin as needed), all with at least two earlier paracenteses; 1-year transplant-free survival 93% (27 of 29) against 52% (17 of 33), P = .003. Read in two abstract copies (MDedge, QxMD).
Status: checked
