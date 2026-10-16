# ISCC plausibility check

**Not an official ISCC tool; not affiliated with ISCC.**

A single HTML page that flags waste/residue intakes (such as used cooking oil deliveries) that need a plausibility look, before an auditor does.

## The problem

Paraphrased from ISCC EU 203 (section 3.4.7); read the current standard yourself. ISCC EU 203 §3.4.7 makes checking the plausibility of collected amounts the collecting point's own duty: per delivery for processing units that are points of origin, and for other origins such as restaurants the overall amount per material, including noticeably high amounts or round numbers. At audit, the auditor checks that documents or processes show this check runs. This tool has no material column, so it checks per delivery and per origin only. This is a summary, not a quote.

Many small collecting points keep intake in a spreadsheet and have no such check. This tool is one way to run it.

This is a pre-audit check, not certification advice. Your certification body decides what is acceptable.

## What it does / does NOT do

Does:
- Reads a CSV of intakes in your browser and flags rows that look odd under six simple rules.
- Shows a plain-English "why flagged" and "what to check" for each flag.
- Shows monthly totals per origin and lets you download the flags as a CSV (with the run time, source file name, thresholds and ceilings at the top) to keep with your records. Whether that counts as evidence is for your certification body to decide.

Does not:
- Certify anything, or replace your auditor or your certification body.
- Upload anything. The page makes no network calls and has a Content-Security-Policy that blocks them. You can check this in the source.
- Know your business. The ceilings it ships with are examples only. Set your own.
- Prove that flagged data is wrong, or that unflagged data is right.

## Quick start

1. Download this folder (or just `index.html`).
2. Open `index.html` in a browser.
3. Choose `example/intakes-sample.csv`, then change thresholds and watch the flags update.

## Example output

Three rows from the sample (shortened):

```
2026-07-04  ORIGIN-003  4200  1 Round number    12 of 12 deliveries (100%) from this origin are exact multiples of 100 kg ...
2026-08-03  ORIGIN-007  187   4 Regular pattern 4 deliveries in a row have exactly 187 kg ...
2026-07     ORIGIN-006  1126  3 Monthly total   Total for the month is 1126 kg over 4 deliveries, above the stated monthly capacity of 400 kg.
```

(There is no screenshot; run it on the sample to see the real page.)

## CSV format

The delimiter (comma or semicolon) is detected from the header line. Header names are case-insensitive. Quoted fields, commas inside quotes, CRLF line endings and a BOM are handled.

| Column | Required | Notes |
|---|---|---|
| `date` | yes | `YYYY-MM-DD` by default; a selector on the page also accepts `DD/MM/YYYY` or `MM/DD/YYYY` |
| `origin_id` | yes | your identifier for the supplier/origin |
| `origin_type` | yes | e.g. `restaurant`, `hotel`, `food_factory`, `household`; matched to the ceiling table |
| `quantity_kg` | yes | plain number, no thousands separators. Dot decimal in comma-separated files; in semicolon-separated files a decimal comma (`317,5`) is accepted |
| `delivery_id` | no | copied to the flags CSV |
| `origin_capacity_kg_month` | no | if present, used as the monthly limit for that origin |

## Rules

| # | Rule | Fires when | Default |
|---|---|---|---|
| 1 | Round number | default: an origin is flagged when more than 60% of its deliveries (at least 6) are exact multiples of 100 kg; a single delivery that is a multiple of 1000 kg is only "info". Optional mode: flag every round delivery (stronger for the larger step) | 100 kg / 1000 kg |
| 2 | High amount | one delivery is above the ceiling for its origin type | example ceilings, editable |
| 3 | Monthly total | an origin's monthly total is above its stated capacity, or above type ceiling x N | N = 10 |
| 4 | Regular pattern | same origin, identical quantity, in a row (by date) | 4 or more |
| 5 | Spike | one delivery is more than X times the origin's median | 3x, at least 5 deliveries |
| 6 | Data quality | bad date, zero/negative/non-numeric quantity, missing origin | always on |

Rows failing rule 6 are left out of rules 1 to 5.

## Limits

- Round numbers only mean something if your scale reads finer than the round step. If your scale reads in 50 or 100 kg steps, round totals are normal and rule 1 will mislead; raise the step or ignore it.
- The round share uses all rows in the file, not a rolling window.
- The default ceilings and the "x N" monthly factor are examples, not from any standard. Wrong ceilings give wrong flags.
- It only sees what is in the CSV. It cannot tell whether a figure matches a weighbridge ticket.
- Rules are simple and independent, so one odd delivery can raise several flags.
- Run-of-identical-quantity uses the order by date, then by file order; same-day deliveries are ordered by their position in the file.
- Rules use calendar months of the delivery date. No handling of time zones, units other than kg, or multiple materials.
- The table shows the first 3000 rows of flags and monthly totals; the CSV download has all flags. 50,000 rows are tested to evaluate in well under a few seconds.
- Not an official ISCC tool and not endorsed by ISCC.

Tests: `node --test` in this folder (Node 18 or newer). The tests read the rule block out of `index.html`.

The sample data is synthetic: fictional origins, generated by `example/make_sample.mjs` with a fixed seed.

## Licence

MIT. See `LICENSE`.

Need this done for your business? Simplicity Idea Tech — info@simplicityideatech.com
