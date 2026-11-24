import ExcelJS from "exceljs";
import { POOLS, addMonthsYmd, dueDate, fold, listDebtors, normCode, redis, rid, round2, todayIst } from "./core.js";

// Varaq nomidan aborot: "VARIANT" -> V, "L-aborot" -> L, "qarz" -> Q. Boshqa varaqlar (TAQSIM, Sheet1) o'tkazib yuboriladi.
const sheetPool = (name) => {
  const n = fold(name).trim();
  if (/^variant$/.test(n)) return "V";
  if (/^l[\s-]*a?borot/.test(n)) return "L";
  if (/^qarz/.test(n)) return "Q";
  return null;
};

const val = (c) => {
  const v = c?.value;
  if (v == null) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return v.result ?? null;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    return null;
  }
  return v;
};
const isFormula = (c) => c?.value && typeof c.value === "object" && "formula" in c.value;
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && !isNaN(Number(v.replace(/[\s,]/g, ""))) ? Number(v.replace(/[\s,]/g, "")) : null);
const str = (v) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const isoDate = (v) => {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const m = str(v).match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

const HEAD = {
  id: /^id$/, name: /^ism/, phone: /^tel/, sale: /^bay sana/, day: /^to'?lov sana/, months: /^muddat/, product: /^tavar|^tovar|^mahsulot/,
  cost: /^tani|^tan narx/, rate: /^foiz/, down: /^boshlang/, monthly: /^oylik to'?lov/,
};

// Excel fayldan mijozlarni o'qiydi. Natija: { rows: [...], skipped: [...], sheets: {...} }
export async function parseWorkbook(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const rows = [], skipped = [], sheets = {};
  for (const ws of wb.worksheets) {
    const pool = sheetPool(ws.name);
    // Sarlavha qatorini topish
    let hr = null, col = {};
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const m = {};
      ws.getRow(r).eachCell((c, i) => {
        const h = fold(str(val(c)));
        for (const [k, re] of Object.entries(HEAD)) if (m[k] == null && re.test(h)) m[k] = i;
      });
      if (m.id && m.name && m.cost && m.months) { hr = r; col = m; break; }
    }
    if (!hr) continue;
    if (!pool) { sheets[ws.name] = { skipped: true }; continue; }
    // Oylik to'lov ustunlari: sarlavhadan keyingi qatorda 1, 2, 3 … raqamlari
    const monthCols = {};
    ws.getRow(hr + 1).eachCell((c, i) => {
      const n = num(val(c));
      if (i > (col.down ?? col.cost) && Number.isInteger(n) && n >= 1 && n <= 120) monthCols[n] = i;
    });
    sheets[ws.name] = { pool, count: 0 };

    for (let r = hr + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = str(val(row.getCell(col.name)));
      if (!name) continue;
      const idRaw = num(val(row.getCell(col.id)));
      const label = `${ws.name} ${r}-qator (${name})`;
      const code = idRaw != null ? normCode(String(idRaw), pool) : null;
      const saleDate = isoDate(val(row.getCell(col.sale)));
      const months = num(val(row.getCell(col.months)));
      const cost = num(val(row.getCell(col.cost)));
      const rate = col.rate ? num(val(row.getCell(col.rate))) : null;
      const down = (col.down ? num(val(row.getCell(col.down))) : 0) ?? 0;
      const mCell = col.monthly ? row.getCell(col.monthly) : null;
      const monthlyFixed = mCell && !isFormula(mCell) ? num(val(mCell)) : null;
      const day = col.day ? num(val(row.getCell(col.day))) : null;

      if (!code) { if (cost > 0) skipped.push(`${label}: ID yo'q`); continue; } // ID va tan narxi yo'q qator — mijoz emas (masalan "Tikilgan pul")
      if (!saleDate) { skipped.push(`${label}: bay sanasi yo'q`); continue; }
      if (!(Number.isInteger(months) && months >= 1 && months <= 120)) { skipped.push(`${label}: muddat noto'g'ri (${months ?? "bo'sh"})`); continue; }
      if (!(cost > 0)) { skipped.push(`${label}: tan narxi yo'q`); continue; }

      // Jami summa: oylik to'lov qo'lda yozilgan bo'lsa boshlang'ich + oylik × oy, aks holda tan + (tan − boshlang'ich) × foiz
      let total = round2(monthlyFixed > 0 ? down + monthlyFixed * months : cost + (cost - down) * (rate ?? 0));
      const pays = [];
      for (const [n, i] of Object.entries(monthCols)) {
        const a = num(val(row.getCell(i)));
        if (a > 0) pays.push({ n: Number(n), amount: round2(a) });
      }
      const paid = round2(down + pays.reduce((s, p) => s + p.amount, 0));
      if (paid > total * 1.1) { skipped.push(`${label}: to'langan (${paid}) jami summadan (${total}) ancha ko'p`); continue; }
      const extra = paid > total + 0.009;
      if (extra) total = paid; // yaxlitlash sababli biroz ortiq to'langan: jami = to'langan

      const firstDue = (() => {
        const f = addMonthsYmd(saleDate, 1);
        if (!(Number.isInteger(day) && day >= 1 && day <= 31)) return f;
        const [y, m] = f.split("-").map(Number);
        return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, "0")}`;
      })();

      rows.push({
        code, pool, name: name.slice(0, 60), phone: str(val(row.getCell(col.phone))).slice(0, 30),
        product: str(val(row.getCell(col.product))).slice(0, 80), saleDate, firstDue, months, buyPrice: round2(cost),
        rate, down: round2(down), total, pays, extra,
      });
      sheets[ws.name].count++;
    }
  }
  return { rows, skipped, sheets };
}

// O'qilgan qatordan bot yozuvini yasaydi. To'lov sanasi = o'sha oyning to'lov kuni (kelajakda bo'lsa bugun)
export function toDebtor(r) {
  const rest = round2(r.total - r.down);
  const monthly = round2(rest / r.months);
  const d = {
    id: rid(), inv: rid(8), name: r.name, phone: r.phone, product: r.product, qty: 1, code: r.code, pool: r.pool, note: "",
    currency: "USD", buyPrice: r.buyPrice, total: r.total, down: r.down, months: r.months, monthly,
    lastAmt: round2(rest - monthly * (r.months - 1)), saleDate: r.saleDate, firstDue: r.firstDue, dueDay: Number(r.firstDue.slice(8)),
    chatId: null, tgId: null, username: null, lastReminded: null, payments: [], excuses: [], messages: [], imported: true,
  };
  const today = todayIst();
  if (r.down > 0) d.payments.push({ id: rid(), amount: r.down, date: `${r.saleDate}T09:00:00.000Z`, by: "system", note: "Oldindan to'lov" });
  for (const p of r.pays) {
    const due = dueDate(d, p.n - 1);
    d.payments.push({ id: rid(), amount: p.amount, date: `${due < today ? due : today}T12:00:00.000Z`, by: "excel", note: `Excel: ${p.n}-oy`, n: p.n });
  }
  return d;
}

// Ko'rib chiqish uchun vaqtincha saqlash (1 soat)
export async function stageImport(parsed) {
  const key = rid(6);
  await redis.set(`imp:${key}`, parsed.rows, { ex: 3600 });
  return key;
}

// Yuklash: bor ID'lar o'tkazib yuboriladi (ustiga yozilmaydi)
export async function commitImport(key) {
  const rows = await redis.get(`imp:${key}`);
  if (!rows) return null;
  await redis.del(`imp:${key}`);
  const have = new Set((await listDebtors()).map((d) => d.code).filter(Boolean));
  const add = {}, dup = [];
  for (const r of rows) {
    if (have.has(r.code)) { dup.push(`#${r.code}`); continue; }
    const d = toDebtor(r);
    add[d.id] = d; have.add(r.code);
  }
  const ids = Object.keys(add);
  for (let i = 0; i < ids.length; i += 50) await redis.hset("debtors", Object.fromEntries(ids.slice(i, i + 50).map((k) => [k, add[k]])));
  return { added: ids.length, dup };
}

export const poolName = (p) => POOLS[p] ?? p;
