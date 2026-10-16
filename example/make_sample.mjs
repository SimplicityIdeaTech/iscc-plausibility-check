// Generates example/intakes-sample.csv. Synthetic data, fixed seed. Run: node example/make_sample.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let s = 20261015;
const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const notRound = (q) => (q % 100 === 0 ? q + 7 : q);

const kinds = { restaurant: [40, 220], hotel: [150, 600], food_factory: [900, 3000], household: [8, 35] };
const origins = [];
for (let i = 1; i <= 25; i++) {
  const type = i <= 12 ? "restaurant" : i <= 17 ? "hotel" : i <= 21 ? "food_factory" : "household";
  origins.push({ id: "ORIGIN-" + String(i).padStart(3, "0"), type, cap: i % 3 === 0 && type !== "household" ? { restaurant: 900, hotel: 2600, food_factory: 12000 }[type] : "" });
}
const rows = [];
const months = ["2026-07", "2026-08", "2026-09"];
const day = (m, d) => `${m}-${String(d).padStart(2, "0")}`;

origins.forEach((o, idx) => {
  months.forEach((m, mi) => {
    for (let k = 0; k < 4; k++) {
      const [lo, hi] = o.id === "ORIGIN-010" ? [60, 90] : kinds[o.type];
      let q = notRound(between(lo, hi));
      let d = day(m, 2 + k * 7 + (idx % 5));
      let cap = o.cap;
      // planted issues
      if (o.id === "ORIGIN-003") q = [300, 400, 500, 200][k]; // rule 1 (warn)
      if (o.id === "ORIGIN-004" && mi === 1 && k === 2) q = 2000; // rule 1 strong
      if (o.id === "ORIGIN-005" && mi === 2 && k === 1) q = 640; // rule 2 (restaurant ceiling 300), also 1 no
      if (o.id === "ORIGIN-020" && mi === 0 && k === 3) q = 5430; // rule 2 food factory
      if (o.id === "ORIGIN-022" && mi === 1 && k === 0) q = 120; // rule 2 household
      if (o.id === "ORIGIN-006") { q = 280 + k; cap = 400; } // rule 3: 4 x ~280 > 400 every month
      if (o.id === "ORIGIN-007" && mi === 1) q = 187; // rule 4: four in a row
      if (o.id === "ORIGIN-010" && mi === 2 && k === 3) q = 262; // rule 5 spike only
      rows.push({ date: d, origin: o.id, type: o.type, qty: String(q), cap: String(cap), n: 0 });
    }
  });
});
// rule 6: data quality
rows.push({ date: "2026-08-31", origin: "ORIGIN-012", type: "restaurant", qty: "-45", cap: "" });
rows.push({ date: "2026-13-02", origin: "ORIGIN-013", type: "hotel", qty: "310", cap: "" });
rows.push({ date: "2026-09-12", origin: "", type: "restaurant", qty: "88", cap: "" });
rows.push({ date: "2026-09-14", origin: "ORIGIN-014", type: "hotel", qty: "0", cap: "" });

rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.origin < b.origin ? -1 : 1));
const out = ["delivery_id,date,origin_id,origin_type,quantity_kg,origin_capacity_kg_month"];
rows.forEach((r, i) => out.push([`DEL-${String(i + 1).padStart(5, "0")}`, r.date, r.origin, r.type, r.qty, r.cap].join(",")));
const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, "intakes-sample.csv"), out.join("\n") + "\n");
console.log("wrote", rows.length, "rows");
