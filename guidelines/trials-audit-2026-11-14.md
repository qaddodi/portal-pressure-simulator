# Landmark portal-hypertension trials: source-audited evidence tables

**Prepared:** November 14, 2026  
**Scope:** 21 trials, including 12 additional RCT cards beyond the 9 initially named trial families.  
**Primary source:** original publication indexed on PubMed, plus openly accessible original full text and figures where indicated.  
**Baveno source:** Baveno VIII Faculty. *Baveno VIII – Advancing consensus in portal hypertension*. *J Hepatol*. 2026,85(5):993–1018. [PMID: 42624290], DOI: 10.1016/j.jhep.2026.07.030, [full numbered text](https://www.journal-of-hepatology.eu/article/S0168-8278(26)02778-9/fulltext).

## Critical limitations and usage rules

**This is not a completed line-by-line supplementary-material or registry audit of every trial.** All 21 primary citations were verified. A trial's source-grade entry specifies when original full text was inspected, rather than implying the abstract contains the full CONSORT information. For inaccessible publications, the full arm-specific Table 1, all exclusions, serious adverse event table and follow-up range remain deliberately unfilled. Those trials are **not approved for a production eligibility checker** until the missing primary-material fields are verified.

**Copyright:** Detailed eligibility is paraphrased, preserving every cutoff actually verified. Complete verbatim protocols are not reproduced.

**Source annotations:** Each row ends in a source locator such as “primary abstract, Methods/Results”, “full text Table 1” or “original PDF Figure 2”. Numbers without access to the relevant original page are not fabricated. Main-text PDF page numbering may differ from publisher issue page numbers.

**Reported vs calculated:** Bold results are reported unless marked **Calculated**. NNT/NNH are arithmetic summaries of **observed count proportions**, not substitutes for time-to-event effects and not necessarily the investigators' NNTs. A no-difference p value is not proof of equivalence. Group percentages or KM estimates cannot be converted to exact counts by rounding.

**Eligibility flags:** “Partial only” means a missing exclusion is unknown, not false. Be careful with CAVARLY's inconsistent upper Child score and Lv's 3 postrandomization exclusions. The simulator should distinguish `trial_eligible`, `current_Baveno_recommended`, and `insufficient_data_for_determination`.

**Forest plot:** Show the original specified metric (HR, OR, RR), its 95% confidence interval and endpoint name. Avoid pooling HR and RR on the same effect axis without clear stratification.

**100 dots:** If actual n/N is available, display a *normalized visualization* rounded to the closest dot out of 100, explicitly labeling the true n/N and percent. For 1-year Kaplan–Meier probabilities, label the dots as illustrative probability pictures, not patient counts. Do not produce an exact 100-dot plot for a result with unavailable numerators.

## Contents

1. PREDESCI | NSBB to prevent first decompensation [PMID: 30910320]
2. Tripathi 2009 | carvedilol vs EVL, first bleed [PMID: 19610055]
3. Shah 2014 | carvedilol vs EVL [PMID: 24291366]
4. CALIBRE 2025 | carvedilol vs EVL [PMID: 40241373]
5. CAVARLY 2024 | carvedilol vs EVL vs combination [PMID: 39067870]
6. García-Pagán 2010 | pre-emptive covered TIPS [PMID: 20573925]
7. Lv 2019 | pre-emptive covered TIPS in advanced cirrhosis [PMID: 31153882]
8. Villanueva 2013 | restrictive vs liberal RBC transfusion [PMID: 23281973]
9. Bureau 2021 | rifaximin before elective TIPS [PMID: 33524293]
10. Bureau 2017 | covered TIPS vs LVP plus albumin [PMID: 27663604]
11. ANSWER 2018 | long-term albumin [PMID: 29861076]
12. CONFIRM 2021 | terlipressin for HRS-1 [PMID: 33657294]
13. Fernández 2007 | primary SBP prophylaxis in high-risk ascites [PMID: 17854593]
14. Ginès 1990 | secondary SBP prophylaxis [PMID: 2210673]
15. Fernández 2006 | ceftriaxone vs norfloxacin in GI bleeding [PMID: 17030175]
16. Bass 2010 | rifaximin prevention of recurrent HE [PMID: 20335583]
17. Sharma 2009 | lactulose secondary HE prophylaxis [PMID: 19501587]
18. Sort 1999 | albumin with antibiotics for SBP [PMID: 10432325]
19. GAVAPROSEC 2025 | pre-emptive TIPS for fundal gastric varices [PMID: 40517780]
20. ATTIRE 2021 | inpatient albumin [PMID: 33657293]
21. MACHT 2018 | albumin plus midodrine [PMID: 30138685]

## One evidence table per trial


### 1. PREDESCI | NSBB to prevent first decompensation

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Villanueva C, Albillos A, Genescà J, et al. β blockers to prevent decompensation of cirrhosis in patients with clinically significant portal hypertension (PREDESCI): a randomised, double-blind, placebo-controlled, multicentre trial. Lancet. 2019,393(10181):1597–1608. **[PMID: 30910320]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 30910320](https://pubmed.ncbi.nlm.nih.gov/30910320/)**. DOI: **[10.1016/S0140-6736(18)31875-0](https://doi.org/10.1016/S0140-6736(18)31875-0)**. Registry: **NCT01059396**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Investigator-initiated, double-blind, 1:1 randomized, 8 hospitals in Spain. Evaluated Jan 18, 2010 through July 31, 2013. Evaluated 631, randomized 201. Follow-up median and range not given in accessible abstract. **Source:** PubMed primary abstract, Methods and Findings. |
| **Inclusion and exclusion criteria** | Compensated cirrhosis, CSPH assessed invasively with **HVPG ≥10 mmHg**, without high-risk varices. All underwent IV propranolol challenge to determine acute response. **HVPG decrease ≥10%** defined responder for stratified drug selection. The full exclusion list, including upper Child/MELD, ascites history, kidney and blood-pressure limits, is **not verified** from the abstract. **Source:** primary abstract, Methods. **Eligibility checker status:** partial only. |
| **Baseline per randomized arm** | Active n=100, placebo n=101. Among active: propranolol n=67 and carvedilol n=33. Arm-specific age, sex, etiology, Child, MELD, actual HVPG distribution, variceal grades and ascites count not in verified abstract. **Source:** primary abstract, Findings. |
| **Treatment and comparator** | Acute IV propranolol responders received **propranolol up to 160 mg twice daily**, nonresponders **carvedilol ≤25 mg/day**, compared with matching placebo. Individual dose selected during an open-label titration preceding concealed randomization. **Source:** primary abstract, Methods. |
| **Primary endpoint and estimand** | First decompensation (**ascites, variceal bleeding or overt HE**) or death, analyzed ITT with non-liver deaths as competing events. **16/100 (16%) active vs 27/101 (27%) placebo. HR 0.51 (95% CI 0.26–0.97), p=0.041**. **Source:** primary abstract, Methods and Findings. |
| **Secondary endpoints and mortality** | Incident ascites reduction HR **0.44 (95% CI 0.20–0.97), p=0.0297**. Absolute ascites event counts, all-cause mortality arm counts and other secondary effect measures not in accessible abstract. **Source:** primary abstract, Findings. |
| **Absolute benefit and NNT/NNH** | **Calculated, not reported:** 10.73 percentage-point absolute difference, NNT 10 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. |
| **Adverse events and serious harms** | Severe adverse events in **4 active vs 2 placebo**. Overall AE rates characterized as similar but arm-specific totals not given. **Source:** primary abstract, Findings. |
| **Early stopping and caveats** | No early termination reported in the accessible abstract. Invasively confirmed CSPH, no high-risk varices, challenge-based selection of propranolol vs carvedilol and modest event counts limit generalization to unselected compensated cirrhosis or to carvedilol-only therapy. |
| **Baveno VIII statement and fit** | **3.15** supports considering NSBB, preferentially carvedilol, for prevention of decompensation in compensated CSPH. This RCT itself did **not** compare carvedilol with propranolol in an unselected cohort. |
| **Card/100-dot/forest implementation** | 100-dot: yes for primary crude rates, 16/100 vs27/101. Forest: primary HR 0.51 (0.26–0.97), and ascites HR separately. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 2. Tripathi 2009 | carvedilol vs EVL, first bleed

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Tripathi D, Ferguson JW, Kochar N, et al. Randomized controlled trial of carvedilol versus variceal band ligation for the prevention of the first variceal bleed. Hepatology. 2009,50(3):825–833. **[PMID: 19610055]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 19610055](https://pubmed.ncbi.nlm.nih.gov/19610055/)**. DOI: **[10.1002/hep.23045](https://doi.org/10.1002/hep.23045)**. Registry: **Not verified from accessed primary abstract**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Randomized multicenter open-label treatment comparison in **5 centers**, n=152. Country, exact enrollment period and follow-up range not verified. **Median follow-up 20 months**. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Cirrhosis with **grade II or larger esophageal varices** and no previous variceal bleeding, from primary prophylaxis design. Additional exclusions, numeric renal function, BP, Child and bilirubin cutoffs not verified. **Source:** primary abstract, Methods. |
| **Baseline per randomized arm** | Carvedilol n=77, EVL n=75. **Pooled**, not per arm: median age 54 years, median Child-Pugh 8, alcoholic liver disease 73%. Baseline sex, MELD, HVPG, ascites and arm-specific counts not verified. **Source:** primary abstract. |
| **Treatment and comparator** | Carvedilol **12.5 mg PO daily** versus EVL **every 2 weeks until eradication**, using multibander. **Source:** primary abstract. |
| **Primary endpoint and estimand** | First variceal bleed in ITT: **10% carvedilol vs 23% EVL**, reported relative hazard **0.41 (95% CI 0.19–0.96), p=0.04**. Exact integer event counts are not reported in accessed abstract. Per-protocol analysis did not identify a significant difference. **Source:** primary abstract, Results. |
| **Secondary endpoints and mortality** | All-cause mortality **35% vs 37%, p=0.71**, bleeding-related mortality **3% vs 1%, p=0.26**, carvedilol first in both comparisons. Counts/CI not verified. **Source:** primary abstract, Results. |
| **Absolute benefit and NNT/NNH** | **Not count-calculable** from accessible source. Approximate difference between printed bleeding percentages = 13 percentage points, but counts and precision are unverified. Do not encode as definitive NNT. |
| **Adverse events and serious harms** | **Six EVL patients had bleeding attributed to banding ulcers**. Complete other AE totals not verified. **Source:** primary abstract, Results. |
| **Early stopping and caveats** | No early stop verified. Small early trial and major discrepancy between ITT and nonsignificant per-protocol result. Subsequent Shah and CALIBRE trials did not establish clear superiority. |
| **Baveno VIII statement and fit** | **3.15, 3.19**, regarding NSBB prevention and EVL when NSBB cannot be used. These statements do not claim carvedilol is superior to EVL for first bleed. |
| **Card/100-dot/forest implementation** | 100-dot: display percentages only with a clear rounding label, raw n per arm unavailable. Forest: relative hazard 0.41 (0.19–0.96). |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 3. Shah 2014 | carvedilol vs EVL

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Shah HA, Azam Z, Rauf J, et al. Carvedilol vs. esophageal variceal band ligation in the primary prophylaxis of variceal hemorrhage: a multicentre randomized controlled trial. J Hepatol. 2014,60(4):757–764. **[PMID: 24291366]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 24291366](https://pubmed.ncbi.nlm.nih.gov/24291366/)**. DOI: **[10.1016/j.jhep.2013.11.019](https://doi.org/10.1016/j.jhep.2013.11.019)**. Registry: **Not verified**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Randomized, multicenter, three university hospitals in Pakistan. 209 screened, **82 carvedilol / 86 EVL** randomized. **Mean follow-up 13.3±12.1 months, range 1–50**, not median. Recruitment dates and blinding not confirmed in accessible abstract. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Cirrhosis with esophageal varices requiring primary prophylaxis. Exact variceal size, Child, renal and BP cutoffs not verified. **Source:** primary abstract, Methods. |
| **Baseline per randomized arm** | Pooled only: n=168, **mean age 48±12.2**, **122/168 male (72.7%)**, **viral cirrhosis 89.9%**, **mean Child-Pugh 7.3±1.6**. Arm-specific age, gender, MELD, HVPG, ascites and variceal stage not available in primary abstract. **Source:** primary abstract, Results. |
| **Treatment and comparator** | Carvedilol **12.5 mg daily** versus serial EVL. EVL schedule not in the verified abstract. **Source:** primary abstract. |
| **Primary endpoint and estimand** | First variceal bleed: **carvedilol 6.9% versus EVL 8.5%**, based on the reported comparator order (original wording begins “Both EVL and carvedilol groups ... 8.5% vs 6.9% respectively”). No HR, CI, p or exact event counts provided in abstract. **Source:** primary abstract, Results. **Do not assume significant superiority**. |
| **Secondary endpoints and mortality** | Bleeding-related mortality in source comparator order **EVL 4.6% vs carvedilol 4.9%** and overall mortality **EVL 12.8% vs carvedilol 19.5%**. These arm assignments follow the grammatical order of the primary abstract and **must be checked against the main table before production**. Exact counts, CI and p missing. **Source:** primary abstract, Results. |
| **Absolute benefit and NNT/NNH** | Not calculated. Raw event numerators not verified and the comparator order for mortality is potentially ambiguous in abstract text. |
| **Adverse events and serious harms** | Carvedilol hypotension **2** requiring cessation, transient nausea **18**, dyspnea **30**. EVL band ulcer bleeding **1**, chest pain **17**, transient dysphagia **58**. Do not treat these as mutually exclusive events. **Source:** primary abstract. |
| **Early stopping and caveats** | Authors explicitly state study underpowered. Predominantly viral cirrhosis and lower overall event rates than Tripathi. No verified early stop. |
| **Baveno VIII statement and fit** | **3.15, 3.19** as general therapy context, not preferential endorsement for one bleeding treatment. |
| **Card/100-dot/forest implementation** | 100-dot: only rounded percentages, not verified integer bleeds. Forest: NO trial-specific effect/CI verified. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 4. CALIBRE 2025 | carvedilol vs EVL

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Tripathi D, Handley K, Holden L, et al. Clinical Trial: A Multicentre Randomised Controlled Trial of Carvedilol Versus Variceal Band Ligation in Primary Prevention of Variceal Bleeding in Liver Cirrhosis (CALIBRE Trial). Aliment Pharmacol Ther. 2025,61(11):1740–1754. **[PMID: 40241373]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 40241373](https://pubmed.ncbi.nlm.nih.gov/40241373/)**. DOI: **[10.1111/apt.70080](https://doi.org/10.1111/apt.70080)**. Registry: **ISRCTN73887615. EudraCT 2018-002488-24.**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Investigator-initiated **open-label 1:1**, UK **60 sites participated, 52 enrolled**. Jan 22, 2019–Aug 31, 2022 (source discrepancy of Jan 21 vs Jan 22 between Results and Abstract). 265 randomized, 133 vs132. Follow-up scheduled at 6 and12 months, **median and range not reported**. **Source:** full text Methods, Results, Figure 1. |
| **Inclusion and exclusion criteria** | Cirrhosis and **grade II medium varices** (do not flatten with insufflation) or **grade III large varices** (occupy lumen), **never previously bled**. Portal vein thrombosis eligible. Already taking propranolol, nadolol, carvedilol for primary prophylaxis or previous variceal banding excluded. Further criteria reside in cited trial protocol and are **not fully validated**. **Source:** main text Participants, trial protocol referenced therein. |
| **Baseline per randomized arm** | Carvedilol n=133 vs VBL n=132. **Male 89/133 vs92/132**, **age mean 59.7±12.6 vs59.5±12.0 years**, **alcohol-related etiology 62/133 vs61/132** (minimization variable), **decompensation 32/133 vs32/132**, **grade II 123/133 vs124/132**, **grade III 10/133 vs9/132**. In lab-complete subgroups: **MELD 8 [IQR7–10] vs 8 [7–10]** with n=93 vs94. **Child-Pugh median 5 [5–6] both** with n=89 vs91. Child A 70/89 vs73/91, B 19/89 vs18/91. **LSM mean 25.5±14.0 vs33.6±18.9 kPa among 14 patients in each arm**. HVPG not reported. **Source:** full text Table 1. |
| **Treatment and comparator** | Carvedilol **12.5 mg PO once daily**, early safety visit and modifications for intolerance, versus protocol-based EVL. **Median delay to actual treatment: 0 days vs27.5 days [IQR9–52]** respectively. **Source:** full text Methods and Table 1. |
| **Primary endpoint and estimand** | First variceal bleed within 1 year, including postbanding ulcer bleeding: **5/133 (3.8%) vs 10/132 (7.6%)**. ITT unadjusted **RR 0.50 (95% CI 0.17–1.41), p=0.189** and **reported risk difference −0.038 (95% CI −0.094 to 0.017), p=0.178**. The source uses a hemoglobin-drop criterion in its bleeding definition that needs protocol check for possible unit inconsistency. **Source:** full text Methods and Table 3. |
| **Secondary endpoints and mortality** | Time to first bleed **HR 0.46 (0.16–1.35), p=0.159**. Mortality by year **8/121 vs13/119**, RR **0.61 (0.26–1.41)** in evaluable population, and **8/133 vs13/132**, Cox HR **0.58 (0.24–1.41)** in randomized denominators. New ascites **7/114 vs11/108**, RR **0.60 (0.24–1.50)**. SBP **2/114 vs3/106**, HR not used. **Source:** full text Table 3 and Results. |
| **Absolute benefit and NNT/NNH** | **Calculated, not reported:** 3.82 percentage-point absolute difference, NNT 27 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. The published primary adjusted/unadjusted risk difference is −0.038 and should be preferred for presentation of its CI. |
| **Adverse events and serious harms** | **Treatment-related serious adverse effect 1 in each arm**, postural hypotension on carvedilol and pain/vomiting after banding in EVL. At carvedilol safety visit, **59/127 experienced an AE, 25/127 required splitting/reduction, 14/127 discontinued carvedilol**. EVL-associated bleeding occurred in **2** of the 10 EVL first bleeds. **Source:** full text Results and Table 4. |
| **Early stopping and caveats** | **Stopped recruitment early** primarily COVID-related and guideline/practice changes. Only **265/2630 planned (10%)** randomized. Underpowered, open-label, delayed EVL treatment, crossover, heterogeneous compensated/decompensated patients, limited HVPG information. A nonsignificant result is not proof of equivalence. |
| **Baveno VIII statement and fit** | **3.15, 3.19**. EVL remains appropriate if NSBB contraindicated/intolerable. Baveno VIII does not say these treatments are equivalent across every clinical outcome. |
| **Card/100-dot/forest implementation** | 100-dot: YES precise bleeding counts with denominators. Forest: RR 0.50 (0.17–1.41) or separate time-to-event HR 0.46 (0.16–1.35). |
| **Verification level** | Full open-access primary text, Tables 1, 3 and 4 verified |


### 5. CAVARLY 2024 | carvedilol vs EVL vs combination

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Tevethia HV, Pande A, Vijayaraghavan R, et al. Combination of carvedilol with variceal band ligation in prevention of first variceal bleed in Child-Turcotte-Pugh B and C cirrhosis with high-risk oesophageal varices: the CAVARLY trial. Gut. 2024,73(11):1844–1853. **[PMID: 39067870]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 39067870](https://pubmed.ncbi.nlm.nih.gov/39067870/)**. DOI: **[10.1136/gutjnl-2023-331181](https://doi.org/10.1136/gutjnl-2023-331181)**. Registry: **NCT03069339**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Single-center randomized, **three parallel arms**, open label, n=330 with 110 per arm, at an academic liver center in New Delhi, India. The article presents inconsistent end dates for recruitment across sections, so the exact interval should not be encoded without reconciliation. **12-month endpoint**, median and range of observed follow-up not verified. **Source:** original article PDF, Methods pp 2–3 and CONSORT Figure 1. |
| **Inclusion and exclusion criteria** | Patients with cirrhosis **Child-Pugh B/C**, high-risk varices, no prior first variceal bleed. Trial describes age **18–75 years**, large varices **>5 mm**, or smaller **<5 mm with red signs**. The article contains apparently conflicting **Child-Pugh cutoffs around 13** (inclusion 7–13 versus exclusion ≥13). Other listed exclusions include previous EVL/TIPS or shunt, HCC, portal-vein thrombosis, severe thrombocytopenia **<30×10⁹/L**, significant renal dysfunction, pregnancy, contraindications to beta blockade. **Source:** article PDF p2, Eligibility. **Do not automate the upper CTP boundary without reviewing protocol/registry.** |
| **Baseline per randomized arm** | Carvedilol n=110 vs EVL n=110 vs combination n=110. **Mean age 51.3±11.1 / 50.6±10.8 /52.3±9.6**, **males 90/95/96**, **MASLD/NAFLD 56/46/52**, **alcohol etiology 30/35/28**, **CTP score 8.80±1.19 /8.91±1.35 /8.91±1.04**, **MELD 15.13±3.36 /15.28±3.44 /15.08±3.27**, **HVPG 16.62±3.48 /16.85±3.52 /17.42±3.70 mmHg**. Source categories for varix grade II plus red signs **59/59/50**, higher grade **51/51/60**. **Source:** article PDF, Table 1 p4. |
| **Treatment and comparator** | Carvedilol **starting 3.125 mg twice daily**, increased by **3.125 mg weekly** to a maximum **12.5 mg twice daily**, targeting HR **55–60 beats/min** while preserving systolic BP **>90 mmHg**. EVL repeated **every 3 weeks** to eradication. Third arm receives both. **Source:** article PDF, Interventions pp2–3. |
| **Primary endpoint and estimand** | First variceal bleed at 12 months ITT: **37/110 (33.6%) carvedilol**, **28/110 (25.5%) EVL**, **13/110 (11.8%) combination**. For combination vs EVL **HR 0.37 (95% CI 0.192–0.716), p<0.003**. For combination vs carvedilol **HR 0.31 (0.163–0.578), p<0.001**. Source **Figure 2 p5** and primary abstract. |
| **Secondary endpoints and mortality** | All-cause 12-month deaths **22/110 (20%) /16/110 (14.5%) /7/110 (6.4%)**, global p=0.012 by abstract. Bleeding-related deaths **13/110 /9/110 /3/110** by Table 2, p and confidence intervals for each pairwise comparison not verified. **Source:** article PDF Table 2 p6 and primary abstract. **Do not confuse bleeding mortality and all-cause mortality.** |
| **Absolute benefit and NNT/NNH** | **Calculated, not reported:** 21.82 percentage-point absolute difference, NNT 5 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. For combo vs EVL: **Calculated, not reported:** 13.64 percentage-point absolute difference, NNT 8 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. |
| **Adverse events and serious harms** | Trial reports no meaningful differences in new ascites, SBP, shock, AKI or postbleed organ failure across groups. **Arm-specific serious AE counts are not verified** from the accessible result sections. **Source:** primary abstract. |
| **Early stopping and caveats** | No early stop reported. Relatively high baseline portal pressure and high bleeding risk, single-center, open-label and enriched Child B/C cohort. **Results should not be generalized to low-risk compensated CSPH.** Verify trial protocol contradiction before implementing eligibility. |
| **Baveno VIII statement and fit** | **No Baveno VIII statement found that endorses combined carvedilol + EVL as routine *primary* prophylaxis.** Context **3.15 and 3.19** applies to NSBB and EVL choice. Do not misapply Baveno VIII **4.8**, which addresses *secondary* prophylaxis after bleeding. |
| **Card/100-dot/forest implementation** | 100-dot: YES all three arms. Forest: combo vs carvedilol HR 0.31 (0.163–0.578), combo vs EVL HR 0.37 (0.192–0.716). |
| **Verification level** | Primary PDF verified including Table 1, Figure 2, Table 2 |


### 6. García-Pagán 2010 | pre-emptive covered TIPS

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | García-Pagán JC, Caca K, Bureau C, et al. Early use of TIPS in patients with cirrhosis and variceal bleeding. N Engl J Med. 2010,362(25):2370–2379. **[PMID: 20573925]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 20573925](https://pubmed.ncbi.nlm.nih.gov/20573925/)**. DOI: **[10.1056/NEJMoa0910102](https://doi.org/10.1056/NEJMoa0910102)**. Registry: **ISRCTN58150114**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Randomized clinical trial, **63** high-risk acute variceal bleeding patients. Randomized within **24 hours** of admission after initial vasoactive medication and endoscopy. **32 early TIPS /31 medical plus EVL**. Median follow-up **16 months**, range not available in accessible abstract. Centers, countries and exact enrollment dates require main paper confirmation. **Source:** primary abstract, Methods and Results. |
| **Inclusion and exclusion criteria** | Cirrhosis with acute variceal bleeding and high risk of failure, described in the primary abstract as **Child-Pugh C** or **Child-Pugh B with persistent bleeding at initial endoscopy**. Exact Child score ranges and other exclusions not established from available abstract. **Source:** primary abstract, Background and Methods. **Baveno VIII 5.31 cutoffs are guidance, not verified as the original RCT eligibility criteria.** |
| **Baseline per randomized arm** | Early TIPS n=32, control n=31. Arm-level age, sex, etiology, Child-Pugh scores, MELD, HVPG, variceal size and ascites prevalence not in accessible abstract. **Source:** primary abstract. |
| **Treatment and comparator** | **PTFE-covered TIPS placed within 72 hours after randomization** versus vasoactive drugs continued 3–5 days followed by propranolol/nadolol + long-term EVL, with rescue TIPS when required. **Source:** primary abstract Methods. |
| **Primary endpoint and estimand** | Composite rebleeding or failure to control bleeding: **1/32 vs14/31**, p=0.001 (counts). One-year actuarial freedom **97% vs50%**, p<0.001 (Kaplan–Meier probabilities). The abstract does **not** furnish a primary composite HR/CI. **Source:** primary abstract Results. |
| **Secondary endpoints and mortality** | Deaths **4/32 vs12/31**, p=0.01. One-year actuarial survival **86% vs61%**, p<0.001. Rescue TIPS performed **7/31** control patients, of whom **4 died**. ICU and hospital time lower with early TIPS but numerical medians not verified. **Source:** primary abstract Results. |
| **Absolute benefit and NNT/NNH** | Observed primary failure **Calculated, not reported:** 42.04 percentage-point absolute difference, NNT 3 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. Observed all-cause death **Calculated, not reported:** 26.21 percentage-point absolute difference, NNT 4 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. **Do not substitute observed proportions for 1-year KM estimates.** |
| **Adverse events and serious harms** | Serious AE frequencies stated as not significantly different, but full event table not available from abstract. **Source:** primary abstract. |
| **Early stopping and caveats** | No early stop verified. Small cohort in specialized centers, narrow high-risk population, composite endpoint, and rescue TIPS in control arm. Distinguish timing from admission, randomization and first endoscopy. |
| **Baveno VIII statement and fit** | **5.31** pre-emptive PTFE-covered TIPS within 72 h, ideally 24 h, for current guideline high-risk eligibility. **5.32** provides a later window for selected patients who miss 72 h. **Guideline eligibility differs from what is verified about the original RCT.** |
| **Card/100-dot/forest implementation** | 100-dot: YES observed composite1/32 vs14/31 and deaths4/32 vs12/31. Forest: no primary HR/CI in verified abstract. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 7. Lv 2019 | pre-emptive covered TIPS in advanced cirrhosis

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Lv Y, Yang Z, Liu L, et al. Early TIPS with covered stents versus standard treatment for acute variceal bleeding in patients with advanced cirrhosis: a randomised controlled trial. Lancet Gastroenterol Hepatol. 2019,4(8):587–598. **[PMID: 31153882]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 31153882](https://pubmed.ncbi.nlm.nih.gov/31153882/)**. DOI: **[10.1016/S2468-1253(19)30090-1](https://doi.org/10.1016/S2468-1253(19)30090-1)**. Registry: **NCT01370161**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Investigator-initiated open-label single academic hospital in China. Recruited Jun 26, 2011–Sep 30, 2017, screened373, randomized132. **2:1 minimization randomization**, 86 to TIPS and46 to control, but published modified ITT **84 vs45** after three postrandomization exclusions. Follow-up median/range not in abstract. **Source:** primary abstract Methods/Findings. |
| **Inclusion and exclusion criteria** | **Child-Pugh B or C cirrhosis**, acute variceal bleeding treated initially with vasoactive drugs and endoscopic therapy. Randomization stratified by Child B/C and active bleeding. Full cutoff for creatinine, bilirubin, MELD, detailed contraindications and ages not verified. Exclusions discovered after randomization included noncirrhotic portal hypertension (two patients) and HCC (one patient). **Source:** primary abstract Methods/Findings. |
| **Baseline per randomized arm** | Assigned early TIPS n=86, control n=46. Outcome analysis n=84 vs45. Arm-specific demographics, Child subclass, MELD, HVPG, varices and ascites not in accessible abstract. **Source:** primary abstract. |
| **Treatment and comparator** | Covered TIPS **within 72 hours after initial endoscopy**, versus vasoactive medications through day5 followed by propranolol plus EVL, rescue TIPS if needed. **Source:** primary abstract. |
| **Primary endpoint and estimand** | Primary **transplant-free survival**, modified ITT after exclusions. **HR 0.50 (95% CI 0.25–0.98), p=0.04**. At 6 weeks KM transplant-free survival **99% vs84%**, reported absolute difference **15 percentage points (95% CI 5–48), p=0.02**. At 1 year **86% vs73%**, reported difference **13 points (95% CI 2–28), p=0.046**. **Source:** primary abstract Findings. |
| **Secondary endpoints and mortality** | Deaths **15/84 (18%) vs15/45 (33%)**. Liver transplantation **2/84 vs1/45**. Overt HE **29/84 vs16/45**, p=1.00. Hydrothorax **2/84 vs1/45**, p=0.96. SBP **1/84 vs3/45**, p=0.12. HRS **4/84 vs6/45**, p=0.10. **Source:** primary abstract Findings. |
| **Absolute benefit and NNT/NNH** | **Published** KM transplant-free survival differences at 6 weeks and 1 year are 15 and13 percentage points respectively and should remain distinct from event-count calculations. For observed deaths only: **Calculated, not reported:** 15.48 percentage-point absolute difference, NNT 7 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. |
| **Adverse events and serious harms** | Other serious adverse events **10/84 (12%) vs11/45 (24%)**, p=0.07. Nonserious AEs **21/84 vs19/45**, p=0.05. **Source:** primary abstract. |
| **Early stopping and caveats** | No early termination reported. Open-label single-center, 2:1 allocation and **exclusion of three patients after randomization**. Wider Child B/C enrolled group differs from narrower contemporary Baveno VIII 5.31 criteria. |
| **Baveno VIII statement and fit** | **5.31 and 5.32**. Note that not every Child B patient in this trial automatically qualifies for pre-emptive TIPS by the current Baveno VIII statement. |
| **Card/100-dot/forest implementation** | 100-dot: raw deaths and complications can be represented. **Do not turn reported KM transplant-free survival into count dots.** Forest: HR0.50 (0.25–0.98). |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 8. Villanueva 2013 | restrictive vs liberal RBC transfusion

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Villanueva C, Colomo A, Bosch A, et al. Transfusion strategies for acute upper gastrointestinal bleeding. N Engl J Med. 2013,368(1):11–21. **[PMID: 23281973]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 23281973](https://pubmed.ncbi.nlm.nih.gov/23281973/)**. DOI: **[10.1056/NEJMoa1211801](https://doi.org/10.1056/NEJMoa1211801)**. Registry: **NCT00414713**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Randomized parallel strategy comparison, 921 people with **severe acute upper GI bleeding**, stratified by cirrhosis, n=461 restrictive and460 liberal. Blinding, recruiting centers/countries, dates and median follow-up not verified from abstract. Main clinical follow-up **6 weeks**. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Severe acute **upper GI bleeding of mixed etiology**, not a variceal-bleeding-only trial. Full exclusions (massive exsanguinating bleeding, ischemic cardiovascular conditions, age and baseline Hb) need main paper/protocol checking before patient-level eligibility logic. Do not mark every patient with variceal hemorrhage as eligible by default. **Source:** primary abstract Methods. |
| **Baseline per randomized arm** | 461 restrictive vs460 liberal randomized. Arm-specific age, sex, peptic-ulcer vs variceal diagnoses, etiology, Child distribution, MELD, HVPG, variceal size and ascites not available in abstract. **Source:** primary abstract. |
| **Treatment and comparator** | Restrictive strategy transfuse when **Hb <7 g/dL**, liberal transfuse when **Hb <9 g/dL**. Full posttransfusion targets not verified from accessed abstract. **Source:** primary abstract Methods. |
| **Primary endpoint and estimand** | Primary reported **6-week survival**, Kaplan–Meier **95% restrictive versus91% liberal**. HR for death **0.55 (95% CI 0.33–0.92), p=0.02**. **Absolute death counts per arm not furnished in primary abstract**, and survival estimates must not be treated as exact counts. **Source:** primary abstract Results. |
| **Secondary endpoints and mortality** | Further bleeding **10% vs16%, p=0.01** and AEs **40% vs48%, p=0.02**. Survival effect in cirrhosis **Child A/B HR 0.30 (0.11–0.85)**, but **Child C HR1.04 (0.45–2.37)**. Portal-pressure gradient increased in liberal group first5 days, p=0.03, not in restrictive. **Source:** primary abstract Results. |
| **Absolute benefit and NNT/NNH** | **Not calculable as patient-count NNT** without six-week deaths and denominators with follow-up. The printed KM survival estimates differ by **4 percentage points**, a time-specific model estimate, not a crude arithmetic risk difference. |
| **Adverse events and serious harms** | All adverse events occurred in **40% vs48%**, p=0.02. Serious adverse event breakdown requires full text. **Source:** primary abstract. |
| **Early stopping and caveats** | No early stop verified. Mixed upper GI bleeding population, emergency context and Child C subgroup uncertainty. The protocol was designed around transfusion triggers rather than simply an Hb target. |
| **Baveno VIII statement and fit** | **5.4**, transfuse restrictively toward **Hb 7–8 g/dL** with individualized exceptions. These guideline targets are not identical to the trial's trigger cutoffs. |
| **Card/100-dot/forest implementation** | 100-dot: only KM percentage illustration, **not an exact event dot graph**. Forest: HR0.55 (0.33–0.92). |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 9. Bureau 2021 | rifaximin before elective TIPS

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Bureau C, Thabut D, Jezequel C, et al. The Use of Rifaximin in the Prevention of Overt Hepatic Encephalopathy After Transjugular Intrahepatic Portosystemic Shunt: A Randomized Controlled Trial. Ann Intern Med. 2021,174(5):633–640. **[PMID: 33524293]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 33524293](https://pubmed.ncbi.nlm.nih.gov/33524293/)**. DOI: **[10.7326/M20-0202](https://doi.org/10.7326/M20-0202)**. Registry: **NCT02016196**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Multicenter, randomized, double-blind, placebo-controlled. **197 enrolled**, but primary outcome analysis reports **n=93 in each arm**. Site count, recruitment period, country list, and follow-up median/range not extractable in abstract. Fixed post-TIPS endpoint **168 days**. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Cirrhosis undergoing TIPS for **intractable ascites** or **secondary prevention of variceal bleeding**. Detailed exclusions including previous HE, transplant candidacy, infection, kidney function and laboratory maxima are not verified in abstract. **Source:** primary abstract. |
| **Baseline per randomized arm** | Primary outcome population **93 rifaximin vs93 placebo**. Initial 197 participants do **not** imply 197 evaluable. Per-arm age, sex, alcoholic etiology percentage, Child/MELD, baseline HE, HVPG and ascites breakdown not present in abstract. **Source:** primary abstract. |
| **Treatment and comparator** | **Rifaximin 600 mg twice daily**, start **14 days before TIPS**, continue **168 days after TIPS**, versus placebo on same schedule. This is not the US 550-mg twice-daily maintenance regimen. **Source:** primary abstract. |
| **Primary endpoint and estimand** | First overt HE within **168 days after TIPS**, **34% (95% CI 25–44%) of n=93 vs53% (95% CI 43–63%) of n=93**, **OR0.48 (95% CI0.27–0.87)**. **Exact event numerators and p not confirmed from accessible primary abstract**. Do not derive integer HE event counts by multiplying rounded percentages. **Source:** primary abstract Results. |
| **Secondary endpoints and mortality** | Transplant-free survival and overall adverse event incidence were not significantly different. Mortality counts, HR/CI/p and serious event counts are not given in abstract. **Source:** primary abstract. |
| **Absolute benefit and NNT/NNH** | **No exact-count ARR/NNT calculated.** Display reported percentage difference **19 percentage points** only as rounded descriptive difference. Do not convert that into an exact NNT without event counts and analysis choice. |
| **Adverse events and serious harms** | Overall AE incidence described as no significant difference. Full AE and infection counts not verified. **Source:** primary abstract. |
| **Early stopping and caveats** | No early stop verified. Trial population largely alcohol-related cirrhosis, elective TIPS indications and prevention restricted to first 168 days. **Do not extrapolate automatically to emergency pre-emptive TIPS.** |
| **Baveno VIII statement and fit** | **6.16** for HE prophylaxis before **elective** TIPS. The research agenda **RA5.11** specifically asks whether prophylactic rifaximin works before pre-emptive TIPS, highlighting evidence gap. |
| **Card/100-dot/forest implementation** | 100-dot: rounded percentage display only pending source verification of exact events. Forest: OR0.48 (0.27–0.87). |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 10. Bureau 2017 | covered TIPS vs LVP plus albumin

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Bureau C, Thabut D, Oberti F, et al. Transjugular Intrahepatic Portosystemic Shunts With Covered Stents Increase Transplant-Free Survival of Patients With Cirrhosis and Recurrent Ascites. Gastroenterology. 2017,152(1):157–163. **[PMID: 27663604]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 27663604](https://pubmed.ncbi.nlm.nih.gov/27663604/)**. DOI: **[10.1053/j.gastro.2016.09.016](https://doi.org/10.1053/j.gastro.2016.09.016)**. Registry: **NCT00222014**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Prospective randomized at **4 tertiary centers in France**, Aug2005–Dec2012, 62 total, **29 covered TIPS vs33 large-volume paracentesis plus albumin (LVP+A)**. Clinical assessments at 1,3,6,9,12 months with **12-month primary endpoint**. Median actual follow-up/range not provided in abstract. **Source:** primary abstract Methods. |
| **Inclusion and exclusion criteria** | Cirrhosis with **at least two large-volume paracenteses over a span of at least 3 weeks**, characterized as **recurrent ascites**. Full inclusion/exclusions including specific creatinine, bilirubin, Child, MELD, history of HE and cardiac limitations are **not verified in abstract**. **Source:** primary abstract. |
| **Baseline per randomized arm** | TIPS n=29, LVP+A n=33. Per-arm age, sex, cirrhosis etiology, Child-Pugh, MELD, measured HVPG, varices, ascites grade and kidney function not in accessed abstract. **Source:** primary abstract. |
| **Treatment and comparator** | **PTFE-covered TIPS** versus repeated **LVP with albumin as required**. Both maintained low-sodium diet. **Source:** primary abstract. |
| **Primary endpoint and estimand** | Primary **1-year transplant-free survival: 93% TIPS vs52% LVP+A, p=0.003**. The primary abstract reports percentages, not unambiguous death/LT event numerators. Method for percentages and HR/CI not in abstract. **Source:** primary abstract Results. |
| **Secondary endpoints and mortality** | Total paracenteses **32 vs320**, PH-related bleeding **0% vs18%, p=0.01**, hernia-related complications **0% vs18%, p=0.01**, hospitalization **17 vs35 days, p=0.04**, **1-year probability of remaining HE-free 65% in each arm**. Study-wide versus per-patient hospitalization measure should be confirmed in full Table before graphing. **Source:** primary abstract Results. |
| **Absolute benefit and NNT/NNH** | **Not computed from primary endpoint counts.** Difference between published one-year TFS percentages is **41 percentage points** but is not exact raw event ARR or validated NNT. |
| **Adverse events and serious harms** | One-year freedom from HE 65% in each arm. Other AEs and serious event denominators not verified. **Source:** primary abstract. |
| **Early stopping and caveats** | No early stop verified. **Small, selected population with recurrent ascites**, not all patients with severe refractory ascites. Caution on external validity and differences in era/stent size. |
| **Baveno VIII statement and fit** | **6.3** recommends considering TIPS for recurrent or refractory ascites. **6.4, 6.5, 6.6** are related counseling and TIPS technical guidance. |
| **Card/100-dot/forest implementation** | 100-dot: **illustrative modeled 1-y 93 vs52 only, not raw event counts**. Forest: no trial-specific HR/CI verified. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 11. ANSWER 2018 | long-term albumin

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Caraceni P, Riggio O, Angeli P, et al. Long-term albumin administration in decompensated cirrhosis (ANSWER): an open-label randomised trial. Lancet. 2018,391(10138):2417–2429. **[PMID: 29861076]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 29861076](https://pubmed.ncbi.nlm.nih.gov/29861076/)**. DOI: **[10.1016/S0140-6736(18)30840-7](https://doi.org/10.1016/S0140-6736(18)30840-7)**. Registry: **NCT01288794 and EudraCT 2008-000625-19**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Investigator-initiated, multicenter, **open-label** pragmatic parallel RCT across **33 hospitals in Italy**. Apr2 2011–May27 2015. **440 randomized, 431 included in modified ITT**. Primary observation window18 months, median/range not given in abstract. **Source:** primary abstract Methods/Findings. |
| **Inclusion and exclusion criteria** | Cirrhosis with **uncomplicated ascites**, already treated with an anti-aldosterone agent **≥200 mg/day** and furosemide **≥25 mg/day**. Important excluded categories such as refractory ascites, active SBP, recent bleeding, transplant status and renal function need full protocol validation. **Source:** primary abstract Methods. |
| **Baseline per randomized arm** | Modified ITT **albumin+SMT n=218** vs **SMT n=213**. Age, sex, etiology, baseline ascites grade, Child, MELD, HVPG, variceal size and actual diuretic-dose distributions are not in available abstract. **Source:** primary abstract. |
| **Treatment and comparator** | **Human albumin40 g twice weekly for 2 weeks, then40 g every week** plus standard medical treatment, versus standard treatment alone, up to **18 months**. **Source:** primary abstract. |
| **Primary endpoint and estimand** | Primary **18-month mortality**. Crude deaths **38/218 vs46/213**, mITT. **18-month KM survival77% vs66%**, **mortality HR0.62 (95% CI0.40–0.95), p=0.028**. HR refers to time to death, not a constant RR. **Source:** primary abstract Findings. |
| **Secondary endpoints and mortality** | Several ascites complications reportedly improved in trial, but exact individual secondary event counts, effect estimates, mortality at shorter time points and transplantation are **not verified** from abstract. **Source:** primary abstract. |
| **Absolute benefit and NNT/NNH** | **Calculated, not reported:** 4.17 percentage-point absolute difference, NNT 25 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. **Important:** this 4.17-point crude death difference is **not equal** to the reported 18-month KM mortality difference of 11 points (survival77 vs66). Do not use the crude NNT as if it were an 18-month KM NNT. |
| **Adverse events and serious harms** | Grade3–4 non-liver adverse events **49/218 (22%) albumin vs46/213 (22%) standard treatment**, per abstract. Full pulmonary edema, infection, other treatment-related AE counts not confirmed. **Source:** primary abstract. |
| **Early stopping and caveats** | No early stop verified. Open-label resource-intensive weekly infusions, Italian setting, a specific ascites phenotype, no direct inference about rescue albumin for all hospitalized patients. Compare with negative MACHT study before portraying albumin as universal disease-modifying therapy. |
| **Baveno VIII statement and fit** | **6.10** only suggests long-term albumin **may be considered for recurrent/refractory ascites when TIPS is not an option** (weak recommendation). This is narrower than blanket albumin for every patient with ascites. |
| **Card/100-dot/forest implementation** | 100-dot: yes for crude total observed mortality but label follow-up/competing risk distinction. Forest: HR0.62 (0.40–0.95). |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 12. CONFIRM 2021 | terlipressin for HRS-1

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Wong F, Pappas SC, Curry MP, et al. Terlipressin plus Albumin for the Treatment of Type 1 Hepatorenal Syndrome. N Engl J Med. 2021,384(9):818–828. **[PMID: 33657294]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 33657294](https://pubmed.ncbi.nlm.nih.gov/33657294/)**. DOI: **[10.1056/NEJMoa2008290](https://doi.org/10.1056/NEJMoa2008290)**. Registry: **NCT02770716**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Phase III placebo-controlled **2:1 randomized**, terlipressin199 vs placebo101, 300 total. Concomitant albumin in both arms strongly recommended. Blinding, study sites/countries, recruitment period, and complete follow-up duration not in accessible abstract. **Up to14 days treatment, day90 mortality follow-up**. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Adults with **type1 hepatorenal syndrome (HRS-1)**. Full original HRS-1 definition with screening baseline creatinine and exact cutoff (e.g., 2.25, 5 or 7 mg/dL), albumin challenge, ACLF grade, oxygen saturation, pulmonary disease and hemodynamic exclusions are **not validated here**. **Do not use the response threshold of creatinine ≤1.5 as an entry criterion.** **Source:** primary abstract Methods. |
| **Baseline per randomized arm** | Terlipressin n=199 vs placebo n=101. Arm-specific age, sex, cirrhosis etiology, baseline creatinine, albumin, Child-Pugh, MELD, HVPG, varices and ascites grade are not contained in abstract. **Source:** primary abstract. |
| **Treatment and comparator** | IV terlipressin versus IV placebo for **up to14 days**, with albumin strongly recommended to both arms. Specific initial bolus dosing/titration in CONFIRM **not confirmed** from primary abstract. Current Baveno VIII guidance prefers continuous infusion, which is not automatically the same as the trial protocol. **Source:** primary abstract. |
| **Primary endpoint and estimand** | **Verified HRS reversal**, defined by **two creatinine values ≤1.5 mg/dL at least2h apart** plus alive without renal replacement for **≥10 days after completion of treatment**. **63/199 (32%) vs17/101 (17%), p=0.006**. Exact RR/OR with confidence interval not available in primary abstract, do not fabricate. **Source:** primary abstract Methods/Results. |
| **Secondary endpoints and mortality** | Any HRS reversal **78/199 vs18/101, p<0.001**. Reversal without RRT to day30 **68/199 vs17/101, p=0.001**. SIRS subgroup **31/84 vs3/48, p<0.001**. Verified reversal without recurrence day30 **52/199 vs17/101, p=0.08**. Day90 liver transplant **46/199 vs29/101**. Day90 mortality **101/199 vs45/101**. **Source:** primary abstract. |
| **Absolute benefit and NNT/NNH** | **Calculated, not reported:** 14.83 percentage-point absolute difference, NNH 7 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. For death from respiratory disorders within day90: **Calculated, not reported:** 9.08 percentage-point absolute difference, NNH 12 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. **The treatment benefit and respiratory-harm estimates are different endpoints with different interpretations.** |
| **Adverse events and serious harms** | Respiratory-disorder-related deaths by day90 **22/199 (11%) terlipressin vs2/101 (2%) placebo**. Abdominal pain, nausea, diarrhea and respiratory failure increased with terlipressin, exact other AE counts not in abstract. **Source:** primary abstract Results. |
| **Early stopping and caveats** | No early stop verified. Increased renal reversal **did not establish survival benefit**, and respiratory failure may be fatal. Historical type1 HRS criteria are not identical to all modern HRS-AKI definitions. Risk-screening and careful albumin/volume management essential. |
| **Baveno VIII statement and fit** | **6.18** considers terlipressin + albumin for HRS-AKI. **6.19** prefers a continuous IV infusion starting **2–3 mg/24h to reduce AEs**. This is current Baveno guidance, not confirmed as the original CONFIRM regimen. |
| **Card/100-dot/forest implementation** | 100-dot: exact primary 63/199 vs17/101 plus harm22/199 vs2/101. Forest: NO published HR/RR/OR CI verified from primary abstract for primary endpoint. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 13. Fernández 2007 | primary SBP prophylaxis in high-risk ascites

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Fernández J, Navasa M, Planas R, et al. Primary prophylaxis of spontaneous bacterial peritonitis delays hepatorenal syndrome and improves survival in cirrhosis. Gastroenterology. 2007,133(3):818–824. **[PMID: 17854593]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 17854593](https://pubmed.ncbi.nlm.nih.gov/17854593/)**. DOI: **[10.1053/j.gastro.2007.06.065](https://doi.org/10.1053/j.gastro.2007.06.065)**. Registry: **Not verified**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Randomized placebo-controlled n=68 **norfloxacin35 vs placebo33**. Double-blinding listed in PubMed article metadata. Site count/countries, recruitment dates and median follow-up/range not verified in abstract. Endpoints assessed at3mo and1y. **Source:** primary abstract and PubMed metadata. |
| **Inclusion and exclusion criteria** | Advanced cirrhosis and ascitic **total protein <15 g/L (1.5 g/dL)** plus **either** Child-Pugh **≥9 and total bilirubin ≥3 mg/dL**, **or** renal dysfunction defined by **creatinine ≥1.2 mg/dL**, **BUN ≥25 mg/dL**, **or serum sodium ≤130 mEq/L**. Other exclusions and age limits not verified. **Source:** primary abstract Methods. |
| **Baseline per randomized arm** | Norfloxacin n=35 vs placebo n=33. Per-arm baseline age, sex, etiologies, Child/MELD, HVPG, varices, ascites grade, bilirubin and creatinine distributions not available from abstract. **Source:** primary abstract. |
| **Treatment and comparator** | Long-term **norfloxacin vs placebo**. Dose not specified in accessed abstract and must not be presumed from other studies. **Source:** primary abstract. |
| **Primary endpoint and estimand** | The main endpoints were **probability of survival at3 months and1 year**. **3-month survival94% norfloxacin vs62% placebo, p=0.003**, **1-year survival60% vs48%, p=0.05**. These are cumulative probabilities, not event numerators. Exact effect measures and CI not provided in abstract. **Source:** primary abstract Results. |
| **Secondary endpoints and mortality** | One-year probability of **SBP7% vs61%, p<0.001** and HRS **28% vs41%, p=0.02**. Raw event counts not in abstract. **Source:** primary abstract. |
| **Absolute benefit and NNT/NNH** | Not exact-count-calculable. Reported 1y SBP probability differs by54 percentage points, which is **not a raw ARR**. No exact NNT should be entered from abstract-only data. |
| **Adverse events and serious harms** | Arm-specific antibiotic adverse reactions and resistant organism rates not in accessible abstract. |
| **Early stopping and caveats** | No early stop verified. Extremely selected low-protein ascites/high-risk population, small sample and changing antibiotic resistance. **Baveno VIII 4.12 now advises against routine long-term primary antibiotic prophylaxis after first decompensation solely to prevent further decompensation.** Distinguish 2007 efficacy evidence from present-day use. |
| **Baveno VIII statement and fit** | **4.12 is a counterpoint, not an endorsement** of routine long-term primary prophylaxis to prevent further decompensation. **RA4.15** asks for further study of primary SBP prophylaxis (research item, not recommendation). No direct modern endorsement may be claimed. |
| **Card/100-dot/forest implementation** | 100-dot: probabilities only, not patient-count events. Forest: no HR/RR/OR CI verified. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 14. Ginès 1990 | secondary SBP prophylaxis

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Ginès P, Rimola A, Planas R, et al. Norfloxacin prevents spontaneous bacterial peritonitis recurrence in cirrhosis: results of a double-blind, placebo-controlled trial. Hepatology. 1990,12(4 Pt1):716–724. **[PMID: 2210673]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 2210673](https://pubmed.ncbi.nlm.nih.gov/2210673/)**. DOI: **[10.1002/hep.1840120416](https://doi.org/10.1002/hep.1840120416)**. Registry: **Not verified**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Multicenter randomized **double-blind** placebo-controlled, **80 total**, 40 per arm. **Mean follow-up6.4±0.6 months, range1–19** (not median). Enrollment period and country list not verified. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Patients with cirrhosis **who recovered from a prior SBP episode**. Numeric bilirubin, creatinine, sodium, Child, ascites protein, exclusion conditions not available in verified abstract. **Source:** primary abstract. |
| **Baseline per randomized arm** | Norfloxacin40 vs placebo40, described as clinically balanced at baseline. Sex, age, etiology, Child/MELD, HVPG, varices and ascites grade not quantified in abstract. **Source:** primary abstract. |
| **Treatment and comparator** | **Norfloxacin400 mg orally daily** versus placebo for long-term **secondary** SBP prophylaxis. **Source:** primary abstract. |
| **Primary endpoint and estimand** | SBP recurrence during observed follow-up **5/40 (12.5%) norfloxacin vs14/40 (35.0%) placebo**, p=0.014. Separately 1-year **cumulative probability20% vs68%**, p=0.0063. HR/CI not verified. **Source:** primary abstract. |
| **Secondary endpoints and mortality** | Gram-negative aerobic-bacillus SBP recurrence **1/40 vs10/40**, p=0.0029, and 1-year modeled gram-negative recurrence3% vs60%, p=0.0013. Mortality and SAEs not available in primary abstract. **Source:** primary abstract. |
| **Absolute benefit and NNT/NNH** | **Calculated, not reported:** 22.50 percentage-point absolute difference, NNT 5 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. Different from cumulative probability difference at1 year. |
| **Adverse events and serious harms** | Adverse event counts not verified. Microbiological resistance patterns and current quinolone selection may be different from 1990. |
| **Early stopping and caveats** | No early stop verified. Historic prophylaxis setting and antibiotic stewardship concerns, local resistance patterns matter. |
| **Baveno VIII statement and fit** | **6.21**, antibiotic prophylaxis should be considered after previous SBP. **6.22** recommends discontinuing when recompensation occurs. The consensus does not mandate a specific antibiotic in every country. |
| **Card/100-dot/forest implementation** | 100-dot: YES5/40 vs14/40. Forest: no HR/CI verified. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 15. Fernández 2006 | ceftriaxone vs norfloxacin in GI bleeding

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Fernández J, Ruiz del Arbol L, Gómez C, et al. Norfloxacin vs ceftriaxone in the prophylaxis of infections in patients with advanced cirrhosis and hemorrhage. Gastroenterology. 2006,131(4):1049–1056. **[PMID: 17030175]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 17030175](https://pubmed.ncbi.nlm.nih.gov/17030175/)**. DOI: **[10.1053/j.gastro.2006.07.010](https://doi.org/10.1053/j.gastro.2006.07.010)**. Registry: **Not verified**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Randomized 111 adults with advanced cirrhosis and gastrointestinal hemorrhage, **57 norfloxacin vs54 ceftriaxone**. Infection outcome within10 days after randomization. Blinding, sites/countries, enrollment date, median follow-up not verified. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Advanced cirrhosis with acute GI bleed and **at least 2** of ascites, severe malnutrition, hepatic encephalopathy or **bilirubin >3 mg/dL**. Additional exclusion criteria unverified. **Source:** primary abstract Methods. |
| **Baseline per randomized arm** | Norfloxacin n=57 vs ceftriaxone n=54. Per-arm demographics, Child/MELD, baseline HVPG, varix sizes, renal values, ascites prevalence not in verified abstract. **Source:** primary abstract. |
| **Treatment and comparator** | **Oral norfloxacin400 mg twice daily** versus **IV ceftriaxone1 g/day**, both **7 days**. **Source:** primary abstract Methods. |
| **Primary endpoint and estimand** | Prevention of bacterial infection by10 days. Probability of proved or possible infection **33% norfloxacin vs11% ceftriaxone, p=0.003**. No arm-specific integer count or adjusted effect CI in abstract. **Source:** primary abstract Results. |
| **Secondary endpoints and mortality** | Proved infection **26% vs11%, p=0.03**, spontaneous bacteremia/SBP **12% vs2%, p=0.03**. No difference in hospital mortality but numerical data not reported. Of7 Gram-negative organisms in norfloxacin arm, **6 quinolone-resistant**. **Source:** primary abstract. |
| **Absolute benefit and NNT/NNH** | Not exact-count-calculable. Reported infection probability difference **22 percentage points** favoring ceftriaxone, with imprecise percentages and no event count in abstract. |
| **Adverse events and serious harms** | Antibiotic adverse event counts not in abstract. Resistance concern documented as **6/7 isolated Gram-negative bacilli** resistant to quinolones in norfloxacin group. |
| **Early stopping and caveats** | No early stop verified. Highly selected advanced cirrhosis, older fluoroquinolone epidemiology, infection is not mortality endpoint. |
| **Baveno VIII statement and fit** | **5.10** antibiotic prophylaxis at AVB presentation. **5.11** generally prefers third-generation cephalosporins with local resistance/antimicrobial policy considerations. |
| **Card/100-dot/forest implementation** | 100-dot: percentage illustration only pending raw count. Forest: no trial-specific effect/CI confirmed. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 16. Bass 2010 | rifaximin prevention of recurrent HE

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Bass NM, Mullen KD, Sanyal A, et al. Rifaximin treatment in hepatic encephalopathy. N Engl J Med. 2010,362(12):1071–1081. **[PMID: 20335583]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 20335583](https://pubmed.ncbi.nlm.nih.gov/20335583/)**. DOI: **[10.1056/NEJMoa0907893](https://doi.org/10.1056/NEJMoa0907893)**. Registry: **NCT00298038**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Randomized **double-blind placebo-controlled** multicenter trial, **299** total, rifaximin140 vs placebo159, fixed **6-month follow-up**. Enrollment dates, number of sites/countries, median actual follow-up not verified in abstract. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Chronic liver disease in **remission after recurrent overt HE**. Complete inclusion and exclusion details for number of prior episodes, HE grade, renal function, MELD, transplant and psychometric thresholds not established in accessible abstract. **Source:** primary abstract Methods. |
| **Baseline per randomized arm** | Rifaximin n=140 vs placebo n=159. **>90% received concomitant lactulose**, pooled. Arm-specific age, sex, etiology, CTP/MELD, HVPG, varices and ascites not in abstract. **Source:** primary abstract. |
| **Treatment and comparator** | **Rifaximin550 mg orally twice daily** for **6 months** compared with placebo, usually on background lactulose. **Source:** primary abstract Methods and Results. |
| **Primary endpoint and estimand** | Primary time to first breakthrough overt HE over6mo: **22.1% vs45.9%** rifaximin vs placebo, **HR0.42 (95% CI0.28–0.64), p<0.001**. Integer event counts not explicitly in abstract, must not back-solve from rounded rates. **Source:** primary abstract Results. |
| **Secondary endpoints and mortality** | First HE-related hospitalization **13.6% vs22.6%**, HR **0.50 (95% CI0.29–0.87), p=0.01**. Mortality counts and HR/CI not verified. **Source:** primary abstract Results. |
| **Absolute benefit and NNT/NNH** | No exact-count NNT calculated. The reported breakthrough HE percentages differ by **23.8 percentage points**, but the primary effect is a time-to-event HR. |
| **Adverse events and serious harms** | Adverse and serious adverse event rates described as similar without arm-specific numbers in abstract. **Source:** primary abstract. |
| **Early stopping and caveats** | No early stop verified. **Secondary** prevention trial in patients with prior recurrent HE, not prophylaxis in all patients with cirrhosis or after every emergency TIPS. |
| **Baveno VIII statement and fit** | **No directly corresponding numbered Baveno VIII statement for routine maintenance rifaximin after recurrent HE was identified in the reviewed Panel 6 numbered recommendations.** Statement **6.16 concerns elective TIPS** only, so should not be assigned to this trial as if it were its indication. This is a gap in direct trial-to-Baveno VIII mapping, not a lack of HE evidence. |
| **Card/100-dot/forest implementation** | 100-dot: rounded percentages only until exact counts verified. Forest: HR0.42 (0.28–0.64). |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 17. Sharma 2009 | lactulose secondary HE prophylaxis

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Sharma BC, Sharma P, Agrawal A, et al. Secondary prophylaxis of hepatic encephalopathy: an open-label randomized controlled trial of lactulose versus placebo. Gastroenterology. 2009,137(3):885–891.e1. **[PMID: 19501587]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 19501587](https://pubmed.ncbi.nlm.nih.gov/19501587/)**. DOI: **[10.1053/j.gastro.2009.05.056](https://doi.org/10.1053/j.gastro.2009.05.056)**. Registry: **Not verified**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Open-label randomized trial, **140 enrolled from300 evaluated** after recovery from HE. Primary outcome denominator **61 lactulose and64 placebo** (125 evaluable). **Median follow-up14 months, range1–20 months**. Site, country, enrollment date and explanation of different randomized vs evaluable denominators not verified. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Cirrhosis after clinical recovery from HE. Psychometric testing, CFF and ammonia obtained at entry. Exact HE-recovery definition, Child/MELD and creatinine thresholds, exclusions not verified. **Source:** primary abstract. |
| **Baseline per randomized arm** | Evaluable n=61 lactulose vs64 placebo. Pooled abnormalities: CFF **<38 Hz in77/140 (55%)** and many abnormal psychometric tests. Arm-specific age, sex, etiology, CTP/MELD, HVPG, varices and ascites not in abstract. **Source:** primary abstract. |
| **Treatment and comparator** | **Lactulose vs placebo/no lactulose** according to trial description. Lactulose exact dose, frequency and stool target not specified in abstract. **Source:** primary abstract. |
| **Primary endpoint and estimand** | Recurrent overt HE **12/61 (19.6%) lactulose vs30/64 (46.8%) placebo**, p=0.001. **Efficacy analysis is on 125 evaluable, not all140 randomized**. No RR/CI/HR supplied in abstract. **Source:** primary abstract Results. |
| **Secondary endpoints and mortality** | Deaths **5/61 vs11/64**, p=0.18. Readmission for non-HE causes **9 vs6**, p not significant. Exact 95% CIs not available. **Source:** primary abstract Results. |
| **Absolute benefit and NNT/NNH** | **Calculated, not reported:** 27.20 percentage-point absolute difference, NNT 4 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. Crude comparisons use the **evaluable** denominators. |
| **Adverse events and serious harms** | Adverse effects, diarrhea/dehydration and serious AE counts not reported in accessed abstract. |
| **Early stopping and caveats** | No early stop verified. Open-label design and **140 enrolled versus125 efficacy analyzed**, requiring attrition reconciliation. HE diagnosis is partly clinical. |
| **Baveno VIII statement and fit** | **5.22** recommends lactulose to prevent/treat OHE after acute variceal bleeding, a *different clinical setting*. **No exact directly corresponding numbered Baveno VIII Panel 6 statement for general HE secondary prophylaxis was verified.** Avoid assigning 5.22 as though it addressed this study population. |
| **Card/100-dot/forest implementation** | 100-dot: YES12/61 vs30/64, with evaluable-denominator disclaimer. Forest: no published effect/CI verified. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 18. Sort 1999 | albumin with antibiotics for SBP

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Sort P, Navasa M, Arroyo V, et al. Effect of intravenous albumin on renal impairment and mortality in patients with cirrhosis and spontaneous bacterial peritonitis. N Engl J Med. 1999,341(6):403–409. **[PMID: 10432325]**. **Source:** PubMed citation metadata. |
| **PMID, DOI and registry** | **[PMID: 10432325](https://pubmed.ncbi.nlm.nih.gov/10432325/)**. DOI: **[10.1056/NEJM199908053410603](https://doi.org/10.1056/NEJM199908053410603)**. Registry: **Not verified**. **Source:** PubMed citation and primary abstract. |
| **Design, sites, dates and follow-up** | Randomized trial **126 cirrhotic patients with SBP**, n=63 in each arm. Hospital outcome primary and **3-month mortality**. Country, centers, enrollment dates, blinding and median follow-up not confirmed from accessible abstract. **Source:** primary abstract. |
| **Inclusion and exclusion criteria** | Cirrhosis with **spontaneous bacterial peritonitis**, without verified complete diagnostic and exclusion cutoffs in abstract. Do not apply this RCT to routine uncomplicated ascites or to all bacterial infections. **Source:** primary abstract. |
| **Baseline per randomized arm** | Cefotaxime+albumin n=63, cefotaxime-only n=63. Age, sex, etiology, Child/MELD, creatinine, HVPG, varices and ascites degree not in abstract. **Source:** primary abstract. |
| **Treatment and comparator** | All received IV **cefotaxime** with dose adapted to renal function. Albumin group additionally received **1.5 g/kg at diagnosis and1.0 g/kg on day3**. **Source:** primary abstract Methods. |
| **Primary endpoint and estimand** | Nonreversible renal deterioration in hospital **6/63 (10%) albumin vs21/63 (33%) control, p=0.002**. RR/CI not supplied in primary abstract. **Source:** primary abstract Results. |
| **Secondary endpoints and mortality** | Infection resolved **62/63 vs59/63**, p=0.36. In-hospital deaths **6/63 vs18/63**, p=0.01. Three-month deaths **14/63 vs26/63**, p=0.03. **Source:** primary abstract Results. |
| **Absolute benefit and NNT/NNH** | AKI **Calculated, not reported:** 23.81 percentage-point absolute difference, NNT 5 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. In-hospital death **Calculated, not reported:** 19.05 percentage-point absolute difference, NNT 6 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. Three-month death **Calculated, not reported:** 19.05 percentage-point absolute difference, NNT 6 (ceiling of inverse difference). These are crude proportions from reported counts, not time-adjusted treatment effects. |
| **Adverse events and serious harms** | Serious AEs not itemized in abstract, and drug-related fluid overload data not verified. **Source:** primary abstract. |
| **Early stopping and caveats** | No early stop verified. Acute SBP with antibiotic adjunct, **not** a test of indefinite weekly albumin such as ANSWER. Subsequent practice depends on renal and bilirubin risk factors and volume tolerance. |
| **Baveno VIII statement and fit** | Baveno VIII primary numbered statements examined do **not** supply a directly corresponding numeric SBP-albumin recommendation in the newly numbered list. Do **not** invent one. The consensus retains older unrevised recommendations in a separate table, but the user requested Baveno VIII only. |
| **Card/100-dot/forest implementation** | 100-dot: YES three clinical endpoints. Forest: no original relative effect CI verified. |
| **Verification level** | Abstract verified, full trial eligibility/baseline incompletely audited |


### 19. GAVAPROSEC 2025 | pre-emptive TIPS for fundal gastric varices

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Cervoni JP, Weil D, et al. Pre-emptive TIPS for gastric variceal bleeding in patients with cirrhosis (GAVAPROSEC): an open-label randomised clinical trial. *Lancet Gastroenterol Hepatol*. 2025, 10(8):726–733. **[PMID: 40517780]**. **Source:** PubMed primary record. |
| **PMID, DOI, registry** | [PMID: 40517780](https://pubmed.ncbi.nlm.nih.gov/40517780/), [DOI 10.1016/S2468-1253(25)00156-6](https://doi.org/10.1016/S2468-1253(25)00156-6), **NCT03705078**. **Source:** PubMed citation and abstract. |
| **Design, sites, dates and follow-up** | Open-label randomized, **17 French tertiary centers**. Enrollment **Jan3,2019–Feb25,2023**. **105 randomized**, **101 modified ITT** after 2 erroneous randomizations and 2 consent withdrawals, **47 p-TIPS vs54 control**. Median actual follow-up not reported in abstract. **Source:** original abstract Methods/Findings. |
| **Inclusion and exclusion criteria** | Cirrhosis with acute **fundal variceal bleeding** (GOV1 excluded), initial hemostasis via endoscopic glue and vasoactive drugs and stable for **at least12 hours**. Excluded/eligible Child-Pugh, age, kidney, bilirubin, MELD, cardiac, portal-thrombosis thresholds not fully verified from abstract. **Source:** original abstract Methods. |
| **Baseline per randomized arm** | **Pooled mITT 101**: mean age **58.2±9.7 years**, male **81/101 (80%)**, alcohol etiology **91/101 (90%)**, mean MELD **14.3±5.0**. Arm-specific values, HVPG, Child, varix classification and ascites not verified in abstract. **Source:** original abstract Findings. |
| **Treatment and comparator** | **PTFE-covered pre-emptive TIPS within72 hours** vs on-demand **endoscopic glue obliteration plus NSBB** after initial hemostasis. **Source:** original abstract Methods. |
| **Primary endpoint and estimand** | **All-cause death or clinically significant rebleeding by1 year**, mITT. One-year **KM freedom from outcome77% (95% CI62–87) TIPS vs37% (24–50) control**, **HR0.25 (95% CI0.12–0.51), p<0.0001**. Exact observed event numerators not in abstract. **Source:** original abstract Findings. |
| **Secondary endpoints and mortality** | **Rescue TIPS20/54 (37%)** control. One-year cumulative HE incidence **35% (CI21–49) TIPS vs32% (19–45) control**. Arm-specific death counts, rebleeding counts and other serious complication counts not verified. **Source:** original abstract Findings. |
| **Absolute benefit and NNT/NNH** | **Reported 1-year KM freedom difference 40 percentage points**. Not a raw event difference, no event-count NNT calculated. |
| **Adverse events and serious harms** | **Glue migration 3/47 vs5/54**. **One cardiac decompensation** in p-TIPS arm. Other serious AE totals missing from abstract. **Source:** original abstract. |
| **Early stopping and caveats** | Early stop not verified. Acute **fundal/GOV2/IGV1**, not GOV1/standard esophageal AVB. Small mITT sample with postrandomization exclusions, high rescue rate in control. Endoscopy and radiologic expertise matter. |
| **Baveno VIII statement and fit** | **5.39–5.41** support acute fundal-varix hemostasis followed by **TIPS ± variceal embolization as preferred definitive therapy**. Baveno VIII **5.31** applies to GOV1 and esophageal varices, not directly to this special fundal-varix trial. |
| **Card/100-dot/forest implementation** | 100-dot: **1-year KM depiction only, not true n/N**. Forest: HR **0.25 (0.12–0.51)** with composite endpoint. |
| **Verification level** | Primary PubMed abstract verified, full eligibility, baseline by arm and adverse-event table pending. |


### 20. ATTIRE 2021 | targeted inpatient albumin vs standard care

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | China L, Freemantle N, Forrest E, et al. A Randomized Trial of Albumin Infusions in Hospitalized Patients with Cirrhosis. *N Engl J Med*. 2021, 384(9):808–817. **[PMID: 33657293]**. **Source:** original publication and PubMed. |
| **PMID, DOI, registry** | [PMID: 33657293](https://pubmed.ncbi.nlm.nih.gov/33657293/), [DOI 10.1056/NEJMoa2022166](https://doi.org/10.1056/NEJMoa2022166), EudraCT2014-002300-24 and ISRCTN14174793. **Source:** original publication. |
| **Design, sites, dates and follow-up** | Randomized open-label targeted albumin versus standard care in hospitalized decompensated cirrhosis in UK. **777 unique evaluated randomized patients**, **380 vs397**. Source reports 829 randomizations because some patients were randomized more than once. Outcome window **day3–15**, median follow-up/range not confirmed. **Source:** NEJM original article Results and Table3. |
| **Inclusion and exclusion criteria** | Hospitalized with decompensated cirrhosis and **serum albumin <30g/L**. Complete exclusion list and screening clinical thresholds require protocol confirmation. In-hospital phenotype, not ANSWER outpatient uncomplicated-ascites group. **Source:** primary paper abstract and main text. |
| **Baseline per randomized arm** | **N=380 targeted vs397 standard**. **Pooled serum albumin mean23.2±3.7 g/L**. Most had alcohol-related disease. Pooled age, sex, Child, MELD, HVPG and baseline ascites by arm require Table1 verification. **Source:** primary paper Results. |
| **Treatment and comparator** | Repeated IV human albumin to raise serum albumin to **≥30g/L** versus standard care. **Median administered albumin200g [IQR140–280] targeted vs20g [0–120] standard** during hospitalization. **Source:** primary paper Results. |
| **Primary endpoint and estimand** | Composite **new infection, renal dysfunction or death from days3–15**. **113/380 (29.7%) targeted vs120/397 (30.2%) standard**, **adjusted OR0.98 (95% CI0.71–1.33), p=0.87**. Survival-analysis **HR1.04 (0.81–1.35)**. **Source:** NEJM original Results and Table2. |
| **Secondary endpoints and mortality** | No significant primary benefit. Grade5 fatal SAE event reports **42 vs48** (these are **event counts**, not necessarily all-cause patient mortality). Do **not** equate the SAE grade5 row to trial mortality unless reconciled. **Source:** full article Table3. |
| **Absolute benefit and NNT/NNH** | **Calculated from primary events:** rates 113/380=29.74% vs120/397=30.23%, crude absolute reduction **0.49 percentage points**, **NNT205**, mathematically only. **Clinically inappropriate as an efficacy headline** because the adjusted primary OR is near1 and nonsignificant. **Source:** original counts, calculated. |
| **Adverse events and serious harms** | Treatment-group serious adverse **grade3 28 vs11 events, grade4 17 vs13 events**. **Any pulmonary edema/fluid overload23 vs8**, and **pulmonary edema15 vs4**. SAE units are **events**, may be multiple per patient. **Source:** original article Table3. |
| **Early stopping and caveats** | No early stop verified. **Negative inpatient serum-albumin-targeting strategy with excess fluid-overload harm**, so do not equate with outpatient ANSWER regimen. Initial randomization count and unique-patient denominator differ. |
| **Baveno VIII statement and fit** | **6.10 is NOT an endorsement of ATTIRE's strategy.** It conditionally considers long-term albumin for recurrent/refractory ascites when TIPS unsuitable. No Baveno VIII numbered recommendation found encouraging routine in-hospital albumin titration to ≥30g/L. |
| **Card/100-dot/forest implementation** | 100-dot: primary count113/380 vs120/397. Forest: original **adjusted OR0.98 (0.71–1.33)**. Safety card23 vs8 fluid overload events is event burden, not an event-person probability. |
| **Verification level** | Primary NEJM article Results and Table3 verified, remaining baseline and protocol pending. |


### 21. MACHT 2018 | albumin plus midodrine awaiting LT

| Field | Verified evidence and source |
|:---|:---|
| **Full citation** | Solà E, Solé C, Simón-Talero M, et al. Midodrine and albumin for prevention of complications in patients with cirrhosis awaiting liver transplantation. A randomized placebo-controlled trial. *J Hepatol*. 2018, 69(6):1250–1259. **[PMID: 30138685]**. **Source:** PubMed primary record. |
| **PMID, DOI, registry** | [PMID: 30138685](https://pubmed.ncbi.nlm.nih.gov/30138685/), [DOI 10.1016/j.jhep.2018.08.006](https://doi.org/10.1016/j.jhep.2018.08.006), **NCT00839358**. **Source:** PubMed. |
| **Design, sites, dates and follow-up** | Multicenter randomized **double-blind placebo-controlled**, **196** cirrhotic transplant candidates with ascites. Followed for up to **1 year or until transplant/list removal**. Enrollment dates, individual arm n and median follow-up not in abstract. **Source:** original abstract Methods. |
| **Inclusion and exclusion criteria** | Cirrhosis with **ascites**, **listed for liver transplant**, other age, Child/MELD, renal, sodium and hemodynamic eligibility rules not verified. **Source:** original abstract. |
| **Baseline per randomized arm** | Total n=196. **Arm denominators, age, sex, etiology, Child/MELD, HVPG and ascites grade not confirmed** by abstract. **Source:** original abstract. |
| **Treatment and comparator** | **Midodrine15–30mg/day plus IV albumin40g every15days** versus matching placebos for up to1year or until LT/list drop-off. **Source:** original abstract. |
| **Primary endpoint and estimand** | Incidence of **any renal failure, hyponatremia, infection, HE or GI bleed**. No significant difference, **p=0.402**. Raw numbers/HR/CI not verified from abstract. **Source:** original abstract Results. |
| **Secondary endpoints and mortality** | No significant **1-year mortality difference, p=0.527**. Plasma renin change **−4.3 vs0.1ng/mL/h, p<0.001** and aldosterone **−38 vs+6ng/dL, p=0.02** at week48 (biomarker not clinical benefit). **Source:** original abstract Results. |
| **Absolute benefit and NNT/NNH** | **Not computable** from accessed original abstract. No validated n/N for the clinical endpoint. |
| **Adverse events and serious harms** | Arm-specific SAEs not reported in abstract. |
| **Early stopping and caveats** | No early stop verified. Lower-dose/less-frequent albumin **40g every15days** combined with midodrine, transplant waitlist population and transplant competition differ substantially from ANSWER. This is **not an equivalent albumin dose trial**. |
| **Baveno VIII statement and fit** | **6.10** long-term albumin may be considered for recurrent/refractory ascites if TIPS unsuitable, but this study does not establish benefit for midodrine/low-frequency albumin while listed for LT. |
| **Card/100-dot/forest implementation** | 100-dot: DO NOT display efficacy counts until source counts verified. Forest: NO clinical endpoint effect+95% CI in verified abstract. |
| **Verification level** | Primary PubMed abstract verified, main Table1/protocol pending. |


## Missing-data validation backlog (must complete before production use)

1. Obtain the original publisher PDFs and protocol/supplement tables for all trials whose baseline and eligibility fields are marked incomplete. Confirm every cutoff, including age, blood pressure, creatinine, bilirubin, MELD, cardiac disease, HCC, PVT, infection, prior HE, and transplant status.
2. Verify **event numerators, denominator analysis population, and follow-up censoring** directly against every primary Table 2/Figure/CONSORT. No percentage-to-count back-calculation.
3. For CAVARLY, resolve the apparent contradictory inclusion/exclusion rules at Child-Pugh score **13** against the registered protocol and original author definitions.
4. For Bureau 2021, reconcile **197 enrolled versus 93+93 analyzed**, obtain the exact event counts and source-defined ITT population, and confirm subgroup data.
5. For Villanueva 2013, extract cause-specific outcomes and cirrhosis subgroup denominators. The entire cohort includes both variceal and nonvariceal hemorrhage.
6. For ANSWER, preserve both **crude events** and **18-month KM survival**. Never display NNT 25 as a model-based 18-month effect.
7. For CONFIRM, obtain complete drug dosing, renal entry criteria, oxygenation and ACLF exclusions from original protocol. Distinguish renal reversal from respiratory-related death and lack of survival improvement.
8. For pre-emptive TIPS, keep the historical trial definitions separate from Baveno VIII statement 5.31, which also recognizes HVPG ≥20 mmHg and specific Child B/C thresholds.
9. Before displaying an interactive current-patient eligibility check, store for each criterion **operator, value, unit, time window, source page, verified status, missing-data behavior**, and direct trial versus guideline provenance. Unknown patient values must produce **cannot determine**, not automatically eligible.
10. Confirm whether a trial was formally stopped early from its report, safety monitoring board documents and trial registry before asserting “No”. This document uses “not verified” instead.

## Other cards worth adding

- **NEJM/SBPs infection** Sort 1999, Fernández 2006, Fernández 2007 and Ginès 1990 as separate “acute SBP adjunct”, “bleed prophylaxis”, “primary prophylaxis” and “secondary prophylaxis” cards.
- **Rescue/secondary prophylaxis** trials comparing PTFE-covered TIPS with EVL plus NSBB, particularly when the simulator shows persistent rebleeding or intolerance of NSBB. These require separate primary-paper verification.
- **RCT of carvedilol vs propranolol in decompensation prevention**, if adding, must distinguish pressure-gradient surrogate studies from clinical endpoint studies.
- **Gastric varices** endoscopic cyanoacrylate/EUS-guided coiling versus radiologic interventions, if a gastric-varix bleeding module is included.

## Four-design data contract recommendation

A single canonical trial record should feed: (1) eligibility checklist, (2) result summary card, (3) exact-denominator and normalized 100-dot depiction, and (4) forest plot. Keep separate `source_numerator`, `source_denominator`, `display_probability`, `analysis_population`, `endpoint_timepoint`, `effect_type`, `effect_estimate`, `ci_low`, `ci_high`, `p_value`, `source_locator`, `verified`, `computed` and `precision_notes`. Three-arm trials should allow more than one comparison against an explicitly chosen reference.

**Baveno VIII statement reference:** [Baveno VIII Faculty, 2026, J Hepatol, PMID 42624290](https://pubmed.ncbi.nlm.nih.gov/42624290/). All numbered statement references in these cards derive from Baveno VIII, not earlier Baveno consensus publications.
