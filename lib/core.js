import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import { Api } from "grammy";

const { BOT_TOKEN } = process.env;

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export class UserError extends Error {}

export const round2 = (n) => Math.round(n * 100) / 100;
export const rid = (n = 4) => crypto.randomBytes(n).toString("hex");

// ---------- pul / matn ----------
export const CURRENCIES = ["USD", "EUR", "TRY", "UZS"];
// Aborotlar (daftar sahifasi tepasidagi belgi bo'yicha)
export const POOLS = { T: "T-aborot", C: "C-aborot" };
export const fmt = (n, cur = "USD") => {
  const s = Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return cur === "USD" ? `$${s}` : cur === "EUR" ? `€${s}` : cur === "TRY" ? `₺${s}` : `${s} so'm`;
};
export const fmtDate = (s) => (s ? s.split("-").reverse().join(".") : "");
export const fold = (s) =>
  String(s).toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c]))
    .replace(/[’‘`´ʻʼ]/g, "'");

// "1.500,50" / "1,500.50" / "200,5" / "200." -> son
export function parseAmount(raw) {
  let s = String(raw).replace(/\s/g, "").replace(/[.,]+$/, "");
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    s = s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    s = parts.length > 2 || parts[1].length === 3 ? parts.join("") : parts.join(".");
  }
  return Number(s);
}

// Harf bilan yozilgan summalarni ham tushunadi: "12 mln", "1,5 mlrd", "500 ming", "12 000 000", "300k"
export function parseMoney(raw) {
  if (typeof raw === "number") return raw;
  const m = fold(raw ?? "").trim().replace(/[$€₺]/g, "").replace(/\s*(so'm|som|sum|usd|dollar|dolar|euro|eur|tl|lira)\.?$/, "").match(/^([\d\s.,]+?)\s*(mlrd|mlyard|milliard|milyar|mld|mln|million|milyon|m|ming|bin|k)?\.?$/);
  if (!m) return NaN;
  const mult = /^(mlrd|mlyard|milliard|milyar|mld)$/.test(m[2] ?? "") ? 1e9 : /^(mln|million|milyon|m)$/.test(m[2] ?? "") ? 1e6 : m[2] ? 1e3 : 1;
  return round2(parseAmount(m[1]) * mult);
}

// ---------- sana (Toshkent/Istanbul vaqti, UTC+3 / +5 farq qilmaydi: sana uchun Istanbul) ----------
const TZ = "Europe/Istanbul";
const pad = (n) => String(n).padStart(2, "0");
const daysIn = (y, m) => new Date(y, m, 0).getDate();
export const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
export const ymd = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

export function addMonthsYmd(s, n) {
  const [y0, m0, d0] = s.split("-").map(Number);
  const idx = m0 - 1 + n;
  const y = y0 + Math.floor(idx / 12), m = (idx % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(d0, daysIn(y, m)))}`;
}

// "2026-11-25", "25.11.2026", "25.11" -> "2026-11-25"; noto'g'ri bo'lsa null
export function normDate(s, { future = false } = {}) {
  s = String(s ?? "").trim();
  if (!s) return null;
  let y, m, d, mm;
  if ((mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, m, d] = mm.map(Number);
  else if ((mm = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) [, d, m, y] = mm.map(Number);
  else if ((mm = s.match(/^(\d{1,2})[./](\d{1,2})$/))) {
    [, d, m] = mm.map(Number);
    y = Number(todayIst().slice(0, 4));
    const out = `${y}-${pad(m)}-${pad(d)}`;
    if (future && out < todayIst()) y += 1;
  } else return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function dueDate(d, k) {
  if (d.overrides?.[k + 1]) return d.overrides[k + 1]; // egasi qo'lda ko'chirgan sana
  const [y0, m0] = d.firstDue.split("-").map(Number);
  const idx = m0 - 1 + k;
  const y = y0 + Math.floor(idx / 12), m = (idx % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(d.dueDay, daysIn(y, m)))}`;
}

// Eski yozuvlarga yangi maydonlarni to'ldiradi
export function norm(d) {
  if (!d) return d;
  d.down ??= 0;
  d.saleDate ??= d.created ?? d.firstDue;
  d.lastAmt ??= round2(d.total - d.down - d.monthly * (d.months - 1));
  d.payments ??= []; d.excuses ??= []; d.messages ??= [];
  return d;
}

// ---------- to'lov jadvali va hisob-kitob ----------
export function schedule(d, today = todayIst()) {
  const rows = [];
  if (d.down > 0) rows.push({ n: 0, due: d.saleDate, amount: d.down });
  for (let k = 0; k < d.months; k++)
    rows.push({ n: k + 1, due: dueDate(d, k), amount: k === d.months - 1 ? d.lastAmt : d.monthly });
  for (const r of rows) { r.paidAmt = 0; r.paidOn = null; }

  let i = 0;
  for (const p of [...d.payments].sort((a, b) => a.date.localeCompare(b.date))) {
    let a = p.amount;
    while (a > 1e-9 && i < rows.length) {
      const take = Math.min(a, round2(rows[i].amount - rows[i].paidAmt));
      rows[i].paidAmt = round2(rows[i].paidAmt + take);
      a = round2(a - take);
      if (rows[i].paidAmt >= rows[i].amount - 1e-6) { rows[i].paidOn = ymd(p.date); i++; }
    }
  }
  for (const r of rows) {
    r.delta = r.paidOn ? daysBetween(r.due, r.paidOn) : null; // + kech, - oldin, 0 vaqtida
    r.late = !r.paidOn && r.due < today;
    r.status = r.paidOn ? "paid" : r.late ? "late" : r.paidAmt > 0 ? "partial" : "pending";
  }
  return rows;
}

export function calc(d, today = todayIst()) {
  norm(d);
  const rows = schedule(d, today);
  const paid = round2(d.payments.reduce((s, p) => s + p.amount, 0));
  const remaining = Math.max(0, round2(d.total - paid));
  const done = remaining === 0;
  const paidMonths = rows.filter((r) => r.n > 0 && r.paidOn).length;
  const open = rows.find((r) => !r.paidOn);
  const overdue = round2(rows.filter((r) => r.late).reduce((s, r) => s + r.amount - r.paidAmt, 0));
  const since = new Date(Date.now() - 31 * 864e5).toISOString();
  return {
    rows, paid, remaining, done, paidMonths, overdue,
    remMonths: d.months - paidMonths,
    partial: open && open.paidAmt > 0 ? open.paidAmt : 0,
    // Hozir to'lashi kerak bo'lgan summa: kechikkan bo'lsa kechikkani, bo'lmasa navbatdagi to'lov
    dueNow: overdue > 0 ? overdue : open ? round2(open.amount - open.paidAmt) : 0,
    nextDue: open?.due ?? null,
    percent: Math.min(100, Math.round((paid / d.total) * 100)),
    recent: d.payments.filter((p) => p.date >= since && p.by !== "system").sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// Natija: "pre" (ertaga to'lov kuni), "due" (bugun), "late" (kechikkan, 7 kunda bir), yoki false
export function shouldRemind(d, today = todayIst()) {
  const c = calc(d, today);
  if (c.done) return false;
  const open = c.rows.filter((r) => !r.paidOn);
  if (open.some((r) => r.due === today)) return "due";
  if (open.some((r) => daysBetween(today, r.due) === 1) && d.lastReminded !== today) return "pre";
  return c.overdue > 0 && (!d.lastReminded || daysBetween(d.lastReminded, today) >= 7) ? "late" : false;
}

// ---------- saqlash ----------
export const listDebtors = async () => Object.values((await redis.hgetall("debtors")) ?? {}).map(norm);
export const getDebtor = async (id) => norm(await redis.hget("debtors", id));
export const saveDebtor = (d) => redis.hset("debtors", { [d.id]: d });
export const deleteDebtor = (id) => redis.hdel("debtors", id);
export const findByInvite = async (code) => (await listDebtors()).find((d) => (d.inv ?? d.id) === code);

export async function createDebtor(inp) {
  const name = String(inp.name ?? "").trim().slice(0, 60);
  const total = parseMoney(inp.total);
  const down = inp.down === "" || inp.down == null ? 0 : parseMoney(inp.down);
  const months = Math.floor(Number(inp.months));
  const currency = inp.currency || "USD";
  const buyPrice = inp.buyPrice === "" || inp.buyPrice == null ? null : parseMoney(inp.buyPrice);
  if (!name) throw new UserError("Mijoz ismini yozing.");
  if (!(total > 0) || total > 1e9) throw new UserError("Sotuv narxi noto'g'ri.");
  if (!(down >= 0) || down >= total) throw new UserError("Oldindan to'lov noto'g'ri (jami summadan kam bo'lishi kerak).");
  if (!(months >= 1 && months <= 120)) throw new UserError("Oylar soni 1 dan 120 gacha bo'lishi kerak.");
  if (!CURRENCIES.includes(currency)) throw new UserError("Valyuta noto'g'ri.");
  if (buyPrice != null && !(buyPrice >= 0)) throw new UserError("Xarid narxi noto'g'ri.");
  if ((await listDebtors()).some((x) => fold(x.name) === fold(name))) throw new UserError(`"${name}" allaqachon bor.`);

  const saleDate = inp.saleDate ? normDate(inp.saleDate) : todayIst();
  if (!saleDate) throw new UserError("Sotilgan sana noto'g'ri. Misol: 17.10.2026");
  const firstDue = inp.firstDue ? normDate(inp.firstDue) : addMonthsYmd(saleDate, 1);
  if (!firstDue) throw new UserError("1-to'lov sanasi noto'g'ri. Misol: 25.11.2026");

  const rest = round2(total - down);
  const monthly = round2(rest / months);
  const lastAmt = round2(rest - monthly * (months - 1));
  if (!(monthly > 0) || !(lastAmt > 0)) throw new UserError("Oylik to'lov juda kichik chiqdi.");

  const d = {
    id: rid(), inv: rid(8), name, phone: String(inp.phone ?? "").trim().slice(0, 30),
    product: String(inp.product ?? "").trim().slice(0, 80), qty: Math.max(1, Math.floor(Number(inp.qty) || 1)),
    code: String(inp.code ?? "").trim().slice(0, 30), note: String(inp.note ?? "").trim().slice(0, 200),
    pool: POOLS[inp.pool] ? inp.pool : "",
    currency, buyPrice, total: round2(total), down: round2(down), months, monthly, lastAmt,
    saleDate, firstDue, dueDay: Number(firstDue.slice(8)),
    chatId: inp.chatId ?? null, tgId: null, username: null, lastReminded: null, by: inp.by ? String(inp.by) : null,
    payments: [], excuses: [], messages: [],
  };
  if (down > 0)
    d.payments.push({ id: rid(), amount: d.down, date: `${saleDate}T09:00:00.000Z`, by: "system", note: "Oldindan to'lov" });
  await saveDebtor(d);
  return d;
}

export async function addPayment(id, amount, by, note = "", date) {
  const d = await getDebtor(id);
  if (!d) throw new UserError("Mijoz topilmadi.");
  amount = round2(parseMoney(amount));
  if (!(amount > 0)) throw new UserError("Summa noto'g'ri. Masalan: 500 yoki 2 mln");
  const { remaining } = calc(d);
  if (remaining === 0) throw new UserError(`${d.name} qarzini to'liq to'lab bo'lgan.`);
  if (amount > remaining + 0.001) throw new UserError(`Summa qolgan qarzdan katta. ${d.name} uchun qolgan: ${fmt(remaining, d.currency)}`);
  let when = new Date().toISOString();
  if (date) {
    const nd = normDate(date);
    if (!nd) throw new UserError("Sana noto'g'ri.");
    if (nd > todayIst()) throw new UserError("Kelajak sanasi bo'lmaydi.");
    when = `${nd}T12:00:00.000Z`;
  }
  const payment = { id: rid(), amount, date: when, by: String(by), note: String(note).slice(0, 100) };
  d.payments.push(payment);
  await saveDebtor(d);
  return { debtor: d, payment };
}

export async function undoPayment(id, pid) {
  const d = await getDebtor(id);
  if (!d) throw new UserError("Mijoz topilmadi.");
  const before = d.payments.length;
  d.payments = d.payments.filter((p) => p.id !== pid);
  if (d.payments.length === before) throw new UserError("Bu to'lov allaqachon o'chirilgan.");
  await saveDebtor(d);
  return d;
}

// To'lov summasi, sanasi yoki izohini tuzatish (masalan, kech to'langan yoki 2 oylik birdan berilgan)
export async function editPayment(id, pid, { amount, date, note } = {}) {
  const d = await getDebtor(id);
  const p = d?.payments.find((x) => x.id === pid);
  if (!p) throw new UserError("To'lov topilmadi.");
  if (amount !== undefined && amount !== "") {
    const a = round2(parseMoney(amount));
    if (!(a > 0)) throw new UserError("Summa noto'g'ri. Masalan: 500 yoki 2 mln");
    p.amount = a;
  }
  if (date) {
    const nd = normDate(date);
    if (!nd) throw new UserError("Sana noto'g'ri.");
    if (nd > todayIst()) throw new UserError("Kelajak sanasi bo'lmaydi.");
    p.date = `${nd}T12:00:00.000Z`;
  }
  if (note !== undefined) p.note = String(note).slice(0, 100);
  if (round2(d.payments.reduce((s, x) => s + x.amount, 0)) > d.total + 0.001)
    throw new UserError("To'lovlar yig'indisi jami summadan oshib ketadi.");
  await saveDebtor(d);
  return d;
}

// O'zgarishlar tarixi: keyinchalik kim nimani o'zgartirgani mijoz kartasida ko'rinadi (oxirgi 50 ta)
export async function addHistory(id, by, text) {
  const d = await getDebtor(id);
  if (!d) return;
  d.history = [...(d.history ?? []), { by: String(by), date: new Date().toISOString(), text: String(text).slice(0, 300) }].slice(-50);
  await saveDebtor(d);
}

// Mijoz ma'lumotlarini tahrirlash (ism, telefon, mahsulot, ID, izoh). Qaytaradi: { d, before }
export async function updateDebtor(id, inp = {}) {
  const d = await getDebtor(id);
  if (!d) throw new UserError("Mijoz topilmadi.");
  const before = { name: d.name, phone: d.phone ?? "", product: d.product ?? "", code: d.code ?? "", note: d.note ?? "" };
  if (inp.name !== undefined) {
    const name = String(inp.name).trim().slice(0, 60);
    if (!name) throw new UserError("Mijoz ismini yozing.");
    if ((await listDebtors()).some((x) => x.id !== d.id && fold(x.name) === fold(name))) throw new UserError(`"${name}" allaqachon bor.`);
    d.name = name;
  }
  const lim = { phone: 30, product: 80, code: 30, note: 200 };
  for (const k of Object.keys(lim)) if (inp[k] !== undefined) d[k] = String(inp[k]).trim().slice(0, lim[k]);
  await saveDebtor(d);
  return { d, before };
}

// Bitta oylik to'lovning muddatini ko'chirish (date=null bo'lsa asl sanaga qaytaradi)
export async function setDueOverride(id, n, date) {
  const d = await getDebtor(id);
  if (!d) throw new UserError("Mijoz topilmadi.");
  n = Math.floor(Number(n));
  if (!(n >= 1 && n <= d.months)) throw new UserError("Bunday oy yo'q.");
  d.overrides ??= {};
  if (!date) delete d.overrides[n];
  else {
    const nd = normDate(date);
    if (!nd) throw new UserError("Sana noto'g'ri.");
    d.overrides[n] = nd;
  }
  await saveDebtor(d);
  return d;
}

export async function addExcuse(id, text) {
  const d = await getDebtor(id);
  if (!d) throw new UserError("Mijoz topilmadi.");
  text = String(text ?? "").trim().slice(0, 500);
  if (!text) throw new UserError("Xabar bo'sh.");
  d.excuses.push({ id: rid(), date: new Date().toISOString(), text });
  d.excuses = d.excuses.slice(-30);
  await saveDebtor(d);
  return d;
}

export async function resetInvite(id) {
  const d = await getDebtor(id);
  if (!d) throw new UserError("Mijoz topilmadi.");
  d.inv = rid(8); d.tgId = null; d.username = null;
  await saveDebtor(d);
  return d;
}

// ---------- ruxsat ----------
export const getOwner = async () => {
  const v = await redis.get("cfg:owner");
  return v == null ? null : String(v);
};
export const claimOwner = async (uid) => (await redis.set("cfg:owner", String(uid), { nx: true })) === "OK";
// Bot bitta guruhga biriktiriladi: shu guruh a'zolari mijozlar va to'lovlar bilan ishlay oladi
export const getHomeGroup = async () => {
  const v = await redis.get("cfg:group");
  return v == null ? null : String(v);
};
export const lockHomeGroup = async (id) => (await redis.set("cfg:group", String(id), { nx: true })) === "OK";

export async function isAuthorized(uid) {
  uid = String(uid);
  if ((await getOwner()) === uid) return true;
  if ((await redis.sismember("cfg:auth", uid)) === 1) return true;
  const group = await getHomeGroup();
  if (!group) return false;
  const key = `cfg:mem:${uid}`;
  const cached = await redis.get(key);
  if (cached != null) return String(cached) === "1";
  let ok = false;
  try {
    const m = await new Api(BOT_TOKEN).getChatMember(group, Number(uid));
    ok = ["creator", "administrator", "member"].includes(m.status) || (m.status === "restricted" && m.is_member);
  } catch {}
  await redis.set(key, ok ? "1" : "0", { ex: 300 });
  return ok;
}
export const addAuthorized = (uid) => redis.sadd("cfg:auth", String(uid));
export const removeAuthorized = (uid) => redis.srem("cfg:auth", String(uid));

// ---------- to'lov kartalari (egasi va xodimlar kiritadi, mijoz "To'lov qilish"ni bosganda ko'radi) ----------
export const listCards = async () =>
  Object.values((await redis.hgetall("cfg:cards")) ?? {}).sort((a, b) => String(a.added).localeCompare(String(b.added)));
export async function addCard(inp, by) {
  const number = String(inp.number ?? "").replace(/\D/g, "");
  if (number.length < 12 || number.length > 19) throw new UserError("Karta raqami noto'g'ri (12–19 ta raqam bo'lishi kerak).");
  const card = {
    id: rid(), number, holder: String(inp.holder ?? "").trim().slice(0, 60), bank: String(inp.bank ?? "").trim().slice(0, 40),
    by: String(by), added: new Date().toISOString(),
  };
  if ((await listCards()).some((c) => c.number === number)) throw new UserError("Bu karta allaqachon qo'shilgan.");
  await redis.hset("cfg:cards", { [card.id]: card });
  return card;
}
export const deleteCard = (id) => redis.hdel("cfg:cards", String(id));
export const fmtCard = (n) => String(n).replace(/(\d{4})(?=\d)/g, "$1 ");

// Mijoz "to'ladim" deb bildirgan to'lov (egasi tasdiqlaguncha saqlanadi, 30 kun)
export async function createClaim(debtorId, amount) {
  const cid = rid();
  await redis.set(`claim:${cid}`, { id: debtorId, amount }, { ex: 30 * 86400 });
  return cid;
}
// Bir marta ishlaydi: ikki marta bosilsa ham to'lov ikki marta yozilmaydi
export async function takeClaim(cid) {
  const v = await redis.get(`claim:${cid}`);
  if (!v) return null;
  return (await redis.del(`claim:${cid}`)) === 1 ? v : null;
}

export const getTemplate = async () => (await redis.get("cfg:template")) || null;
export const setTemplate = (t) => (t ? redis.set("cfg:template", t) : redis.del("cfg:template"));

// Telegram initData tekshiruvi
export function authUser(req) {
  const initData = req.headers["x-init-data"] || "";
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  const check = [...params].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calcHash = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (calcHash !== hash) return null;
  if (Date.now() / 1000 - Number(params.get("auth_date")) > 86400) return null;
  try { return String(JSON.parse(params.get("user")).id); } catch { return null; }
}

// Oddiy tezlik cheklovi: bir foydalanuvchi uchun daqiqasiga `max` ta so'rov
export async function rateLimited(uid, max = 90) {
  const key = `rl:${uid}:${Math.floor(Date.now() / 60000)}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 90);
  return n > max;
}

// Faqat egasi/vakillar uchun endpointlar
export async function requireAuth(req, res) {
  const uid = authUser(req);
  if (!uid) { res.status(401).json({ error: "Telegram ichidan oching." }); return null; }
  if (await rateLimited(uid)) { res.status(429).json({ error: "Juda ko'p so'rov. Biroz kuting." }); return null; }
  if (!(await getOwner())) await claimOwner(uid);
  if (!(await isAuthorized(uid))) { res.status(403).json({ error: "Sizda bu panelga ruxsat yo'q." }); return null; }
  await rememberName(uid, reqUser(req));
  return uid;
}

// ---------- kim qildi: guruh a'zolarining ismlari ----------
// Har bir o'zgarishda kim qilgani ko'rsatiladi (masalan "👤 Abubakr"), shuning uchun ismlar saqlab boriladi
export const personName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(" ") || (u?.username ? "@" + u.username : "");
export const reqUser = (req) => {
  try { return JSON.parse(new URLSearchParams(req.headers["x-init-data"] || "").get("user")); } catch { return null; }
};
export async function rememberName(uid, u) {
  const n = personName(u);
  if (n) await redis.hset("cfg:names", { [String(uid)]: n }).catch(() => {});
}
export const getNames = async () => (await redis.hgetall("cfg:names")) ?? {};
