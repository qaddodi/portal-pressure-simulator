# Trials the talks cite

The trial list behind the trial card (`tool: { kind: 'trial', id }`, `src/ui/trials.js`). Since 14 Nov 2026 every number on a card comes from the
reviewer's audited evidence tables, `guidelines/trials-audit-2026-11-14.md` (21 trials; index `guidelines/trials-audit-2026-11-14.csv`), and only a
value the audit gives as reported: never one it marks **Calculated**, never a count worked back from a percent, never rounded. `tests/trials.test.js`
fails a trial in `src/ui/trials.js` that has no section here, a status that differs, a rate that is not a percent from 0 to 100 with at most one
decimal, a rate, n, PMID, ratio or Baveno VIII statement that this file does not give, and a slide that names a trial this file does not list.

Each section is `## <id>`, the citation, the PMID and DOI, what was read and from where (the audit's trial number and the source locator it gives),
the ratios, a `Baveno VIII:` line and a `Status:` line. `checked` means every number on the card is in the audit's table for that trial.
`unchecked` means it is not; the card then says "Not yet checked against the paper".

Baveno VIII statements (never Baveno VII) were each found in `guidelines/baveno-viii-2026.pdf` (pdftotext, 14 Nov 2026) saying what the line
below claims; a statement the audit mapped that does not say what the trial tested is left out, and the section says why. `Baveno VIII: none`
means no numbered statement corresponds.

What the card does not claim: follow-up, setting, entry and caveat lines are the audit's words, kept short and in US units. Where the audit did not
give a field, the field is left out of `src/ui/trials.js`, not filled from memory. Most trials are abstract-verified only; the audit says their
eligibility and baseline tables are incomplete and that they are not approved for a production eligibility checker, so an entry rule the model
cannot check is kept with test null (shown as "cannot tell").

## predesci
Villanueva C, et al. Lancet 2019;393(10181):1597–1608. β blockers to prevent decompensation of cirrhosis in patients with clinically significant portal hypertension (PREDESCI).
PMID 30910320. DOI 10.1016/S0140-6736(18)31875-0. Audit trial 1 (primary abstract, Methods and Findings).
Read: 201 randomized (100 beta-blocker, 101 placebo); compensated cirrhosis, CSPH by HVPG ≥10 mmHg, no high-risk varices; propranolol for acute HVPG responders (fall ≥10%), carvedilol for the others; decompensation or death 16/100 (16%) against 27/101 (27%); HR 0.51 (0.26–0.97), p = 0.041; ascites HR 0.44 (0.20–0.97).
Ratios: HR 0.51 (0.26–0.97); HR 0.44 (0.20–0.97).
Changed from the earlier record: the follow-up "Median 37 months" is gone (the audit says the median was not given in the abstract it read), so the card has no follow-up line.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 3.15 (NSBBs, particularly carvedilol, in compensated cirrhosis with CSPH to prevent decompensation).
Status: checked

## tripathi
Tripathi D, et al. Hepatology 2009;50(3):825–833. Randomized controlled trial of carvedilol versus variceal band ligation for the prevention of the first variceal bleed.
PMID 19610055. DOI 10.1002/hep.23045. Audit trial 2 (primary abstract, Results).
Read: 152 randomized in 5 centers (77 carvedilol, 75 EVL); cirrhosis with grade II or larger esophageal varices, never bled; median follow-up 20 months; first variceal bleed (ITT) 10% against 23%; relative hazard 0.41 (0.19–0.96), p = 0.04; the per-protocol analysis found no significant difference. No event counts in the abstract.
Ratios: HR 0.41 (0.19–0.96) (reported as relative hazard).
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 3.15, 3.19 (NSBB prevention; EVL when NSBBs cannot be used). Neither says carvedilol is better than EVL.
Status: checked

## shah
Shah HA, et al. J Hepatol 2014;60(4):757–764. Carvedilol vs. esophageal variceal band ligation in the primary prophylaxis of variceal hemorrhage.
PMID 24291366. DOI 10.1016/j.jhep.2013.11.019. Audit trial 3 (primary abstract, Results).
Read: 168 randomized (82 carvedilol, 86 EVL) in three hospitals in Pakistan; mean follow-up 13.3 ± 12.1 months (range 1–50); first variceal bleed 6.9% on carvedilol against 8.5% on EVL (the arm order follows the abstract's wording, as the audit reads it); no HR, CI, p or event counts; the authors call the trial underpowered.
Ratios: none reported.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 3.15, 3.19 (as context for the choice of NSBB or EVL).
Status: checked

## calibre
Tripathi D, et al. Aliment Pharmacol Ther 2025;61(11):1740–1754. A multicentre randomised controlled trial of carvedilol versus variceal band ligation in primary prevention of variceal bleeding in liver cirrhosis (CALIBRE).
PMID 40241373. DOI 10.1111/apt.70080. Audit trial 4 (full text Methods, Results, Tables 1, 3 and 4).
Read: 265 randomized (133 carvedilol, 132 band ligation), open label, UK; medium (grade II) or large (grade III) varices, never bled; not already on an NSBB or banding for prophylaxis; first variceal bleed within 1 year 5/133 (3.8%) against 10/132 (7.6%); RR 0.50 (0.17–1.41), p = 0.189; time to first bleed HR 0.46 (0.16–1.35); deaths 8/133 against 13/132, Cox HR 0.58 (0.24–1.41); new ascites RR 0.60 (0.24–1.50). Stopped early with 265 of 2630 planned (10%).
Ratios: RR 0.50 (0.17–1.41); HR 0.46 (0.16–1.35); HR 0.58 (0.24–1.41); RR 0.60 (0.24–1.50).
Verified: full open-access text; Tables 1, 3 and 4 verified.
Baveno VIII: 3.15, 3.19.
Status: checked

## cavarly
Tevethia HV, et al. Gut 2024;73(11):1844–1853. Combination of carvedilol with variceal band ligation in prevention of first variceal bleed in Child-Turcotte-Pugh B and C cirrhosis with high-risk oesophageal varices: the CAVARLY trial.
PMID 39067870. DOI 10.1136/gutjnl-2023-331181. Audit trial 5 (article PDF, Eligibility p 2, Table 1 p 4, Figure 2 p 5, Table 2 p 6).
Read: 330 randomized, 110 per arm, single center, open label; Child–Pugh B or C, high-risk varices (>5 mm, or smaller with red signs), never bled, age 18 to 75; excluded previous EVL, TIPS or shunt, HCC, portal vein thrombosis, platelets <30 × 10⁹/L (30,000/µL). First variceal bleed at 12 months: combination 13/110 (11.8%), EVL 28/110 (25.5%), carvedilol 37/110 (33.6%). Combination against EVL HR 0.37 (0.192–0.716); combination against carvedilol HR 0.31 (0.163–0.578).
The upper Child–Pugh score is contradictory in the article (inclusion 7–13, exclusion ≥13), so it is not an entry rule.
Ratios: HR 0.37 (0.192–0.716); HR 0.31 (0.163–0.578).
Verified: primary PDF; Table 1, Figure 2 and Table 2 verified.
Baveno VIII: none. The audit found no statement that endorses carvedilol plus EVL as primary prophylaxis; 3.15 is about compensated patients and 3.19 about EVL when NSBBs cannot be used, and 4.8 is secondary prophylaxis, so none is given.
Status: checked

## earlytips
García-Pagán JC, et al. N Engl J Med 2010;362(25):2370–2379. Early use of TIPS in patients with cirrhosis and variceal bleeding.
PMID 20573925. DOI 10.1056/NEJMoa0910102. Audit trial 6 (primary abstract, Methods and Results).
Read: 63 randomized within 24 hours of admission, after vasoactive drugs and endoscopy (32 early TIPS, 31 drugs plus EVL); Child–Pugh C, or B with persistent bleeding at the first endoscopy; median follow-up 16 months; rebleeding or failure to control bleeding 1/32 against 14/31 (p = 0.001); 1-year actuarial freedom from it 97% against 50% (p < 0.001); 1-year actuarial survival 86% against 61% (p < 0.001), the card's bars (Kaplan–Meier); deaths 4/32 against 12/31. No HR for the primary endpoint.
Ratios: none reported.
Changed from the earlier record: the PMID (was "not looked up"); the earlier file gave p = 0.001 for the 97% against 50%, which the audit gives as p < 0.001 (p = 0.001 is the count comparison). The card shows no p, so no card number changed.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 5.31, 5.32 (preemptive covered TIPS within 72 hours; a later window for patients who miss it). Today's criteria are not the trial's.
Status: checked

## lvtips
Lv Y, et al. Lancet Gastroenterol Hepatol 2019;4(8):587–598. Early TIPS with covered stents versus standard treatment for acute variceal bleeding in patients with advanced cirrhosis.
PMID 31153882. DOI 10.1016/S2468-1253(19)30090-1. Audit trial 7 (primary abstract, Methods and Findings).
Read: 132 randomized 2:1 (86 early TIPS, 46 control; 84 and 45 in the modified ITT after 3 exclusions after randomization); Child–Pugh B or C, acute variceal bleeding after vasoactive drugs and endoscopy; transplant-free survival HR 0.50 (0.25–0.98), p = 0.04; Kaplan–Meier transplant-free survival 99% against 84% at 6 weeks and 86% against 73% at 1 year. No median follow-up in the abstract, so the card says "1 year", the time of the outcome.
Ratios: HR 0.50 (0.25–0.98).
Changed from the earlier record: the arms now carry the analyzed numbers (84, 45).
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 5.31, 5.32. Not every Child–Pugh B patient in this trial meets the 5.31 criteria.
Status: checked

## transfusion
Villanueva C, et al. N Engl J Med 2013;368(1):11–21. Transfusion strategies for acute upper gastrointestinal bleeding.
PMID 23281973. DOI 10.1056/NEJMoa1211801. Audit trial 8 (primary abstract, Methods and Results).
Read: 921 randomized (461 restrictive, 460 liberal) with severe acute upper GI bleeding of mixed cause; transfuse at hemoglobin <7 g/dL against <9 g/dL; Kaplan–Meier survival at 6 weeks 95% against 91%; HR for death 0.55 (0.33–0.92), p = 0.02; in cirrhosis, Child–Pugh A or B HR 0.30 (0.11–0.85) and Child–Pugh C HR 1.04 (0.45–2.37); further bleeding 10% against 16%.
Ratios: HR 0.55 (0.33–0.92); HR 0.30 (0.11–0.85); HR 1.04 (0.45–2.37).
Changed from the earlier record: 921 randomized is now read in the audit (it was second-hand); the caveat no longer says the cirrhosis subgroup as a whole was not significant (the audit does not give that), and gives the two Child–Pugh HRs instead.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 5.4 (restrictive transfusion to a hemoglobin of 7 to 8 g/dL). The guideline's target is not the trial's trigger.
Status: checked

## gavaprosec
Cervoni JP, Weil D, et al. Lancet Gastroenterol Hepatol 2025;10(8):726–733. Pre-emptive TIPS for gastric variceal bleeding in patients with cirrhosis (GAVAPROSEC).
PMID 40517780. DOI 10.1016/S2468-1253(25)00156-6. Audit trial 19 (original abstract, Methods and Findings).
Read: 105 randomized in 17 French centers, 101 in the modified ITT (47 preemptive TIPS, 54 control); acute fundal variceal bleeding (GOV1 excluded) controlled with glue and vasoactive drugs, stable ≥12 hours; covered TIPS within 72 hours against glue plus NSBB; 1-year Kaplan–Meier freedom from death or significant rebleeding 77% (62–87) against 37% (24–50); HR 0.25 (0.12–0.51), p < 0.0001; rescue TIPS in 20/54 controls; 1-year HE 35% against 32%.
Ratios: HR 0.25 (0.12–0.51).
Verified: abstract verified; eligibility, baseline by arm and adverse events pending.
Baveno VIII: 5.39, 5.40, 5.41 (GOV2 and IGV1 bleeding: acute hemostasis, then TIPS ± embolization as the preferred definitive treatment). 5.31 is for esophageal varices and GOV1, so it is not given.
Status: checked

## covered
Bureau C, et al. Gastroenterology 2017;152(1):157–163. Transjugular intrahepatic portosystemic shunts with covered stents increase transplant-free survival of patients with cirrhosis and recurrent ascites.
PMID 27663604. DOI 10.1053/j.gastro.2016.09.016. Audit trial 10 (primary abstract, Methods and Results).
Read: 62 randomized at 4 centers in France (29 covered TIPS, 33 large-volume paracentesis with albumin); recurrent ascites, ≥2 large-volume paracenteses over ≥3 weeks; 1-year transplant-free survival 93% against 52%, p = 0.003. The audit treats the two as modeled probabilities, not counts, so the card marks them as such.
Ratios: none reported.
Changed from the earlier record: the earlier file read "27 of 29" and "17 of 33"; the audit says the abstract gives no unambiguous numerators, so those counts are gone. The entry rule now has the 3-week span.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 6.3 (patients with recurrent or refractory ascites should be considered for TIPS). 6.4 to 6.6, which the audit names as related, are about discussing transplant and stent dilation, not what the trial tested, so they are not given.
Status: checked

## answer
Caraceni P, et al. Lancet 2018;391(10138):2417–2429. Long-term albumin administration in decompensated cirrhosis (ANSWER): an open-label randomised trial.
PMID 29861076. DOI 10.1016/S0140-6736(18)30840-7. Audit trial 11 (primary abstract, Methods and Findings).
Read: 440 randomized at 33 hospitals in Italy, 431 in the modified ITT (218 albumin plus standard care, 213 standard care); uncomplicated ascites on an aldosterone antagonist ≥200 mg/day and furosemide ≥25 mg/day; albumin 40 g twice weekly for 2 weeks, then 40 g weekly, up to 18 months; crude deaths 38/218 against 46/213; 18-month Kaplan–Meier survival 77% against 66%; mortality HR 0.62 (0.40–0.95), p = 0.028.
Ratios: HR 0.62 (0.40–0.95).
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 6.10 (long-term albumin may be considered in recurrent or refractory ascites when TIPS is not an option; weak). Narrower than this trial's patients.
Status: checked

## attire
China L, et al. N Engl J Med 2021;384(9):808–817. A randomized trial of albumin infusions in hospitalized patients with cirrhosis (ATTIRE).
PMID 33657293. DOI 10.1056/NEJMoa2022166. Audit trial 20 (NEJM Results, Tables 2 and 3).
Read: 777 unique patients randomized (380 targeted albumin, 397 standard care; 829 randomizations, as some were randomized more than once); hospitalized with decompensated cirrhosis and serum albumin <30 g/L (3.0 g/dL); new infection, renal dysfunction or death on days 3 to 15 in 113/380 (29.7%) against 120/397 (30.2%); adjusted OR 0.98 (0.71–1.33), p = 0.87; HR 1.04 (0.81–1.35); pulmonary edema or fluid overload 23 against 8 events.
Ratios: OR 0.98 (0.71–1.33) (adjusted); HR 1.04 (0.81–1.35).
Verified: NEJM Results and Table 3 verified; baseline and protocol pending.
Baveno VIII: none. The audit: 6.10 is not an endorsement of this strategy, and no statement encourages in-hospital albumin to ≥30 g/L.
Status: checked

## macht
Solà E, et al. J Hepatol 2018;69(6):1250–1259. Midodrine and albumin for prevention of complications in patients with cirrhosis awaiting liver transplantation (MACHT).
PMID 30138685. DOI 10.1016/j.jhep.2018.08.006. Audit trial 21 (original abstract, Methods and Results).
Read: 196 randomized, double blind; cirrhosis with ascites, listed for liver transplant; midodrine 15 to 30 mg/day plus albumin 40 g every 15 days against placebos, up to 1 year; renal failure, hyponatremia, infection, HE or GI bleeding: no difference, p = 0.402; 1-year mortality: no difference, p = 0.527. The abstract gives no arm numbers, rates or counts.
The card has no arms: the audit says not to show efficacy counts until they are verified, so the trial is listed with its result in words only.
Ratios: none reported.
Verified: abstract verified; Table 1 and protocol pending.
Baveno VIII: 6.10 (long-term albumin in recurrent or refractory ascites when TIPS is not an option); this trial does not show a benefit for this regimen.
Status: checked

## confirm
Wong F, et al. N Engl J Med 2021;384(9):818–828. Terlipressin plus albumin for the treatment of type 1 hepatorenal syndrome (CONFIRM).
PMID 33657294. DOI 10.1056/NEJMoa2008290. Audit trial 12 (primary abstract, Methods and Results).
Read: 300 randomized 2:1 (199 terlipressin, 101 placebo), albumin recommended in both; type 1 HRS; up to 14 days of treatment, deaths to day 90; verified HRS reversal 63/199 (32%) against 17/101 (17%), p = 0.006; deaths from respiratory disorders by day 90 22/199 (11%) against 2/101 (2%); day 90 deaths 101/199 against 45/101. No RR or OR with a CI.
Ratios: none reported.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 6.18 (terlipressin and albumin should be considered in HRS-AKI). 6.19 (continuous infusion) is today's regimen, not the trial's, so it is not given.
Status: checked

## fernandez2007
Fernández J, et al. Gastroenterology 2007;133(3):818–824. Primary prophylaxis of spontaneous bacterial peritonitis delays hepatorenal syndrome and improves survival in cirrhosis.
PMID 17854593. DOI 10.1053/j.gastro.2007.06.065. Audit trial 13 (primary abstract, Methods and Results).
Read: 68 randomized (35 norfloxacin, 33 placebo); ascitic protein <15 g/L (1.5 g/dL) and either Child–Pugh ≥9 with bilirubin ≥3 mg/dL, or creatinine ≥1.2 mg/dL, BUN ≥25 mg/dL or sodium ≤130 mEq/L; survival probability at 3 months 94% against 62% (p = 0.003), at 1 year 60% against 48% (p = 0.05); 1-year SBP 7% against 61%. Probabilities, not counts.
Ratios: none reported.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 4.12, as a counterpoint: long-term primary antibiotic prophylaxis after the first decompensation is not recommended to prevent further decompensation. The card's caveat says so.
Status: checked

## gines
Ginès P, et al. Hepatology 1990;12(4 Pt 1):716–724. Norfloxacin prevents spontaneous bacterial peritonitis recurrence in cirrhosis: results of a double-blind, placebo-controlled trial.
PMID 2210673. DOI 10.1002/hep.1840120416. Audit trial 14 (primary abstract).
Read: 80 randomized, 40 per arm, double blind; recovered from SBP; norfloxacin 400 mg daily; mean follow-up 6.4 ± 0.6 months (range 1–19); SBP recurrence 5/40 (12.5%) against 14/40 (35.0%, the card's 35%), p = 0.014; 1-year probability 20% against 68%.
Ratios: none reported.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 6.21 (antibiotic prophylaxis should be considered after SBP to prevent recurrence). 6.22 (stop on recompensation) is not what the trial tested.
Status: checked

## fernandez2006
Fernández J, et al. Gastroenterology 2006;131(4):1049–1056. Norfloxacin vs ceftriaxone in the prophylaxis of infections in patients with advanced cirrhosis and hemorrhage.
PMID 17030175. DOI 10.1053/j.gastro.2006.07.010. Audit trial 15 (primary abstract, Methods and Results).
Read: 111 randomized (57 norfloxacin, 54 ceftriaxone); advanced cirrhosis with GI bleeding and ≥2 of ascites, severe malnutrition, encephalopathy or bilirubin >3 mg/dL; oral norfloxacin 400 mg twice daily against IV ceftriaxone 1 g/day, 7 days; probability of proved or possible infection by day 10 33% against 11%, p = 0.003; 6 of 7 gram-negative organisms on norfloxacin quinolone-resistant. Ceftriaxone is the card's treated arm.
Ratios: none reported.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 5.10, 5.11 (antibiotics at presentation with AVB; third-generation cephalosporins generally preferred).
Status: checked

## sort
Sort P, et al. N Engl J Med 1999;341(6):403–409. Effect of intravenous albumin on renal impairment and mortality in patients with cirrhosis and spontaneous bacterial peritonitis.
PMID 10432325. DOI 10.1056/NEJM199908053410603. Audit trial 18 (primary abstract, Methods and Results).
Read: 126 randomized, 63 per arm, all on cefotaxime; albumin 1.5 g/kg at diagnosis and 1.0 g/kg on day 3; renal impairment that did not reverse, in hospital, 6/63 (10%) against 21/63 (33%), p = 0.002; deaths in hospital 6/63 against 18/63; by 3 months 14/63 against 26/63.
Ratios: none reported.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: none. The audit found no numbered Baveno VIII statement on albumin in SBP (older ones are kept in a separate table, outside Baveno VIII's own list).
Status: checked

## rifaximin
Bureau C, et al. Ann Intern Med 2021;174(5):633–640. The use of rifaximin in the prevention of overt hepatic encephalopathy after transjugular intrahepatic portosystemic shunt: a randomized controlled trial.
PMID 33524293. DOI 10.7326/M20-0202. Audit trial 9 (primary abstract, Results).
Read: 197 enrolled, 93 in each arm analyzed; TIPS for intractable ascites or to prevent variceal rebleeding; rifaximin 600 mg twice daily from 14 days before to 168 days after the TIPS; overt HE within 168 days 34% (25–44) against 53% (43–63); OR 0.48 (0.27–0.87). No event counts in the abstract.
Ratios: OR 0.48 (0.27–0.87).
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: 6.16 (rifaximin should be considered before an elective TIPS).
Status: checked

## bass
Bass NM, et al. N Engl J Med 2010;362(12):1071–1081. Rifaximin treatment in hepatic encephalopathy.
PMID 20335583. DOI 10.1056/NEJMoa0907893. Audit trial 16 (primary abstract, Methods and Results).
Read: 299 randomized (140 rifaximin, 159 placebo), double blind, 6 months; in remission after recurrent overt HE; rifaximin 550 mg twice daily; >90% on lactulose; breakthrough overt HE 22.1% against 45.9%, HR 0.42 (0.28–0.64), p < 0.001; HE hospitalization 13.6% against 22.6%, HR 0.50 (0.29–0.87). No event counts in the abstract.
Ratios: HR 0.42 (0.28–0.64); HR 0.50 (0.29–0.87).
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: none. The audit found no numbered statement on maintenance rifaximin after recurrent HE; 6.16 is about elective TIPS only.
Status: checked

## sharma
Sharma BC, et al. Gastroenterology 2009;137(3):885–891.e1. Secondary prophylaxis of hepatic encephalopathy: an open-label randomized controlled trial of lactulose versus placebo.
PMID 19501587. DOI 10.1053/j.gastro.2009.05.056. Audit trial 17 (primary abstract, Results).
Read: 140 enrolled, 125 analyzed (61 lactulose, 64 placebo), open label; after recovery from HE; median follow-up 14 months (range 1–20); recurrent overt HE 12/61 (19.6%) against 30/64 (46.8%), p = 0.001; deaths 5/61 against 11/64. (The abstract's percents are cut, not rounded, at one decimal: 12/61 is 19.67.)
Ratios: none reported.
Verified: abstract verified; eligibility and baseline incompletely audited.
Baveno VIII: none. 5.22 (lactulose after acute variceal bleeding) is a different setting.
Status: checked
