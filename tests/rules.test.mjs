import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const a = html.indexOf("/* RULES-BEGIN */"), b = html.indexOf("/* RULES-END */");
assert.ok(a > 0 && b > a, "markers found");
const L = new Function(html.slice(a, b) +
  "\nreturn {detectDelimiter,parseCSV,validDate,toRecords,evaluate,defaultConfig,flagsToCSV,isMultiple,median,parseQty};")();

const run = (csv, tweak, opts) => {
  const cfg = L.defaultConfig(); if (tweak) tweak(cfg);
  const p = L.toRecords(L.parseCSV(csv), opts);
  return L.evaluate(p.recs, cfg);
};
const H = "date,origin_id,origin_type,quantity_kg,delivery_id,origin_capacity_kg_month\n";
const rules = (r) => r.flags.map((f) => f.rule.slice(0, 1));

test("csv: quotes, commas in quotes, escaped quotes, CRLF, BOM", () => {
  const t = L.parseCSV('﻿a,b,c\r\n"x,1","he said ""hi""",3\r\n\r\nlast,,\r\n');
  assert.deepEqual(t, [["a", "b", "c"], ["x,1", 'he said "hi"', "3"], ["last", "", ""]]);
});
test("csv: embedded newline in quotes, no trailing newline", () => {
  assert.deepEqual(L.parseCSV('a,b\n"l1\nl2",z'), [["a", "b"], ["l1\nl2", "z"]]);
});
test("header names are case-insensitive, missing columns reported", () => {
  const p = L.toRecords(L.parseCSV("Date,ORIGIN_ID,Origin_Type,Quantity_KG\n2026-01-05,A,hotel,10"));
  assert.equal(p.missingCols.length, 0); assert.equal(p.recs[0].qty, 10);
  assert.deepEqual(L.toRecords(L.parseCSV("date,origin_id\n")).missingCols, ["origin_type", "quantity_kg"]);
});
test("validDate", () => {
  assert.ok(L.validDate("2026-02-28")); assert.ok(L.validDate("2028-02-29"));
  assert.ok(!L.validDate("2026-02-29")); assert.ok(!L.validDate("2026-13-01")); assert.ok(!L.validDate("05/01/2026"));
});
test("rule 1: round numbers, warn vs stronger, non-round clean", () => {
  const r = run(H + "2026-01-01,A,hotel,300,,\n2026-01-02,A,hotel,2000,,\n2026-01-03,A,hotel,317,,\n", (c) => { c.roundMode = "each"; });
  const f = r.flags.filter((x) => x.rule.startsWith("1"));
  assert.equal(f.length, 2);
  assert.equal(f.find((x) => x.kg === 300).level, "warn");
  assert.equal(f.find((x) => x.kg === 2000).level, "high");
  const r2 = run(H + "2026-01-01,A,hotel,250,,\n", (c) => { c.roundMode = "each"; c.roundStep = 50; });
  assert.equal(r2.flags.filter((x) => x.rule.startsWith("1")).length, 1);
});
test("rule 2: per-type ceiling, other fallback, no ceiling skips", () => {
  const r = run(H + "2026-01-01,A,household,51,,\n2026-01-02,B,household,49,,\n2026-01-03,C,weird,1001,,\n");
  const f = r.flags.filter((x) => x.rule.startsWith("2"));
  assert.deepEqual(f.map((x) => x.origin).sort(), ["A", "C"]);
  const r2 = run(H + "2026-01-01,A,household,51,,\n", (c) => { c.ceilings.household = null; });
  assert.equal(r2.flags.filter((x) => x.rule.startsWith("2")).length, 0);
});
test("rule 3: monthly total vs stated capacity and vs type ceiling x N", () => {
  const r = run(H + "2026-03-01,A,restaurant,230,,400\n2026-03-10,A,restaurant,201,,400\n2026-04-01,A,restaurant,170,,400\n");
  const f = r.flags.filter((x) => x.rule.startsWith("3"));
  assert.equal(f.length, 1); assert.equal(f[0].date, "2026-03"); assert.equal(f[0].kg, 431);
  const r2 = run(H + "2026-03-01,B,household,41,,\n2026-03-02,B,household,42,,\n2026-03-03,B,household,43,,\n", (c) => { c.monthMult = 2; });
  assert.equal(r2.flags.filter((x) => x.rule.startsWith("3")).length, 1); // 126 > 50*2
  assert.equal(r2.monthly[0].total, 126);
  const r3 = run(H + "2026-03-01,A,restaurant,170,,400\n2026-03-10,A,restaurant,171,,400\n");
  assert.equal(r3.flags.filter((x) => x.rule.startsWith("3")).length, 0);
});
test("rule 4: identical quantity run of 4, not 3, resets on change", () => {
  const mk = (qs) => H + qs.map((q, i) => `2026-01-${String(i + 1).padStart(2, "0")},A,restaurant,${q},,`).join("\n") + "\n";
  assert.equal(run(mk([187, 187, 187, 187])).flags.filter((x) => x.rule[0] === "4").length, 1);
  assert.equal(run(mk([187, 187, 187, 190, 187])).flags.filter((x) => x.rule[0] === "4").length, 0);
  assert.equal(run(mk([187, 187, 187, 187, 187, 187])).flags.filter((x) => x.rule[0] === "4").length, 1);
});
test("rule 5: spike needs 5 deliveries and > 3x median", () => {
  const mk = (qs) => H + qs.map((q, i) => `2026-01-${String(i + 1).padStart(2, "0")},A,restaurant,${q},,`).join("\n") + "\n";
  assert.equal(run(mk([51, 53, 57, 59, 250])).flags.filter((x) => x.rule[0] === "5").length, 1);
  assert.equal(run(mk([51, 53, 57, 250])).flags.filter((x) => x.rule[0] === "5").length, 0);
  assert.equal(run(mk([51, 53, 57, 59, 170])).flags.filter((x) => x.rule[0] === "5").length, 0);
});
test("rule 6: bad date, zero/negative/non-numeric kg, missing origin; excluded from other rules", () => {
  const r = run(H + "2026-02-30,A,hotel,10,,\n2026-01-01,A,hotel,-5,,\n2026-01-02,A,hotel,0,,\n2026-01-03,,hotel,10,,\n2026-01-04,A,hotel,abc,,\n2026-01-05,A,hotel,300,,\n");
  assert.equal(r.flags.filter((x) => x.rule[0] === "6").length, 5);
  assert.equal(r.stats.dq, 5); assert.equal(r.stats.usable, 1);
  assert.equal(r.flags.filter((x) => x.rule[0] === "1").length, 0);
});
test("rule 1 share mode: origin flagged above 60% of >=6, singles only info", () => {
  const mk = (qs, o = "A") => H + qs.map((q, i) => `2026-01-${String(i + 1).padStart(2, "0")},${o},hotel,${q},,`).join("\n") + "\n";
  const f = run(mk([100, 200, 300, 317, 400, 250])).flags.filter((x) => x.rule[0] === "1");
  assert.equal(f.length, 1); assert.equal(f[0].level, "warn"); assert.match(f[0].why, /4 of 6/);
  assert.equal(run(mk([100, 200, 317, 318, 400, 250])).flags.filter((x) => x.rule[0] === "1").length, 0); // 3/6 not > 60%
  assert.equal(run(mk([100, 200, 300, 400, 500])).flags.filter((x) => x.rule[0] === "1").length, 0); // under min deliveries
  const g = run(mk([2000, 317, 318, 319, 321, 322])).flags.filter((x) => x.rule[0] === "1");
  assert.equal(g.length, 1); assert.equal(g[0].level, "info");
});
test("prototype-like origin ids and types do not crash or leak", () => {
  const r = run(H + "2026-01-01,constructor,constructor,317,,\n2026-01-02,__proto__,__proto__,318,,\n2026-01-03,toString,hotel,319,,\n2026-01-04,hasOwnProperty,hotel,900,,\n");
  assert.equal(r.stats.origins, 4);
  assert.equal(r.monthly.length, 4);
  assert.equal(r.flags.filter((x) => x.rule[0] === "2").length, 1); // only hotel 900 > 800
});
test("semicolon delimiter with decimal comma", () => {
  const csv = "date;origin_id;origin_type;quantity_kg\n2026-01-01;A;hotel;317,5\n2026-01-02;A;hotel;\"1000,25\"\n";
  assert.equal(L.detectDelimiter(csv), ";");
  assert.equal(L.detectDelimiter('a,b\n1;2'), ",");
  assert.equal(L.detectDelimiter('"a;b;c",d\n'), ",");
  const p = L.toRecords(L.parseCSV(csv), { decimalComma: true });
  assert.deepEqual(p.recs.map((r) => r.qty), [317.5, 1000.25]);
  const bad = L.toRecords(L.parseCSV("date,origin_id,origin_type,quantity_kg\n2026-01-01,A,hotel,3.5\n"), {});
  assert.equal(bad.recs[0].qty, 3.5);
});
test("date format DD/MM/YYYY and MM/DD/YYYY", () => {
  const csv = H + "25/12/2026,A,hotel,317,,\n";
  assert.equal(run(csv, null, { dateFormat: "dmy" }).stats.dq, 0);
  assert.equal(run(csv, null, { dateFormat: "mdy" }).stats.dq, 1);
  assert.equal(run(csv).stats.dq, 1);
  assert.equal(run(H + "12/25/2026,A,hotel,317,,\n", null, { dateFormat: "mdy" }).monthly[0].month, "2026-12");
});
test("flags CSV preamble carries run info, thresholds, ceilings", () => {
  const out = L.flagsToCSV([], { runUtc: "2026-01-01T00:00:00Z", sourceFile: "in.csv", cfg: L.defaultConfig(), dateFormat: "ymd" });
  assert.match(out, /# run_utc,2026-01-01T00:00:00Z/); assert.match(out, /# source_file,in.csv/);
  assert.match(out, /# threshold_roundStep,100/); assert.match(out, /# ceiling_kg_restaurant,300/);
  assert.ok(!/is audit evidence/i.test(out));
  assert.ok(out.split("\r\n").some((l) => l.startsWith("date,origin_id")));
});
test("clean data gives no flags", () => {
  assert.equal(run(H + "2026-01-01,A,hotel,317,,\n2026-01-09,A,hotel,342,,\n").flags.length, 0);
});
test("flags CSV: escaping and formula guard", () => {
  const out = L.flagsToCSV([{ date: "2026-01-01", origin: "=EVIL", delivery_id: "", kg: 300, rule: "1 Round number", level: "warn", why: 'a, "b"', check: "c", line: 2 }]);
  assert.ok(out.includes("'=EVIL")); assert.ok(out.includes('"a, ""b"""'));
});
test("50k rows evaluate quickly", () => {
  let csv = H;
  for (let i = 0; i < 50000; i++) csv += `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, "0")},O${i % 500},restaurant,${37 + (i * 7) % 211},,\n`;
  const t = Date.now(); const r = run(csv);
  assert.equal(r.stats.rows, 50000); assert.ok(Date.now() - t < 5000);
});

test("decimal comma: thousands dot is read as thousands, stray dot is an error", () => {
  assert.equal(L.parseQty("1.234", true), 1234);
  assert.equal(L.parseQty("1.234,5", true), 1234.5);
  assert.equal(L.parseQty("112,5", true), 112.5);
  assert.ok(Number.isNaN(L.parseQty("1.23", true)));
  assert.equal(L.parseQty("1.23", false), 1.23);
});
