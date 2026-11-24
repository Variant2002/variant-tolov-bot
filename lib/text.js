import { InlineKeyboard } from "grammy";
import { calc, fmt, fmtCard, fmtDate, fold, getOwner, getTemplate, listCards, parseAmount, parseMoney, saveDebtor, todayIst, ymd } from "./core.js";

export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export const DEFAULT_INTRO =
  "Assalomu alaykum, {ism}! Yaxshimisiz? Qarz to'lash muddatingiz keldi. Bugun to'lov qilishingizni so'raymiz.";

// Tayyor matnlar: panelda bitta bosish bilan tanlanadi. {ism} {sana} {summa} {sotilgan} {mahsulot} o'rniga mijoz ma'lumoti qo'yiladi
export const PRE_INTRO =
  "Assalomu alaykum, {ism}! Eslatib qo'yamiz: ertaga ({sana}) {summa} to'lov kuni. Rahmat!";

export const PRESETS = [
  { title: "To'lov kuni keldi", text: DEFAULT_INTRO },
  { title: "Oldindan eslatma", text: "Assalomu alaykum, {ism}! Eslatib qo'yamiz: {sana} kuni {summa} to'lov qilishingiz kerak. Rahmat!" },
  { title: "Kecha to'lamadingiz", text: "Assalomu alaykum, {ism}! Kecha to'lov kuni edi, lekin to'lov tushmadi. Esingizda bo'lsin, bugun {summa} to'lab qo'yishingizni so'raymiz." },
  { title: "Kechikdingiz", text: "Assalomu alaykum, {ism}! To'lovingiz kechikdi ({sana} kuni bo'lishi kerak edi). Iltimos, imkon qadar tezroq {summa} to'lang yoki qachon to'lashingizni yozib qoldiring." },
  { title: "Bugun to'laysizmi?", text: "Assalomu alaykum, {ism}! Yaxshimisiz? To'lov muddatingiz keldi. Bugun to'lay olasizmi? Javob yozib qo'ysangiz, xursand bo'lamiz." },
  { title: "Mahsulot va sana bilan", text: "Assalomu alaykum, {ism}! {sotilgan} kuni olgan {mahsulot} uchun navbatdagi to'lov vaqti keldi: {summa}. Rahmat!" },
  { title: "Rahmat", text: "Assalomu alaykum, {ism}! To'lovlaringizni o'z vaqtida qilayotganingiz uchun rahmat. Keyingi to'lov: {sana}, {summa}." },
];

// Matndagi {ism}, {sana}, {summa}, {sotilgan}, {mahsulot} ni mijoz ma'lumoti bilan almashtiradi
export function fillVars(text, d, c = calc(d)) {
  return String(text)
    .replaceAll("{ism}", d.name)
    .replaceAll("{sana}", fmtDate(c.nextDue) || "-")
    .replaceAll("{summa}", fmt(c.dueNow, d.currency))
    .replaceAll("{sotilgan}", fmtDate(d.saleDate))
    .replaceAll("{mahsulot}", d.product || "mahsulot");
}

// Mijoz xabari ostidagi tugma
export const payKb = (d) => new InlineKeyboard().text("💳 To'lov qilish", `cards:${d.id}`);

// "To'lov qilish" bosilganda: qancha to'lash kerak va qaysi kartaga
export async function cardsText(d) {
  const c = calc(d), cards = await listCards();
  const L = [`💳 <b>To'lov qilish</b>`, "", `👤 ${esc(d.name)}`];
  if (c.done) L.push("🎉 Qarzingiz to'liq to'langan. Rahmat!");
  else {
    L.push(`💵 Hozir to'lanadigan summa: <b>${fmt(c.dueNow, d.currency)}</b>`);
    if (c.overdue > 0) L.push(`⚠️ Shundan kechikkan: ${fmt(c.overdue, d.currency)}`);
    L.push(`📉 Jami qolgan qarz: ${fmt(c.remaining, d.currency)}`);
  }
  if (!c.done) {
    if (cards.length) {
      L.push("", "Quyidagi kartalardan biriga o'tkazing (raqamni bossangiz nusxa olinadi):");
      for (const k of cards)
        L.push("", `🏦 ${esc(k.bank || "Karta")}`, `<code>${fmtCard(k.number)}</code>`, ...(k.holder ? [`👤 ${esc(k.holder)}`] : []));
      L.push("", "O'tkazganingizdan keyin pastdagi <b>✅ To'lov qildim</b> tugmasini bosing — sotuvchiga xabar boradi.");
    } else L.push("", "Karta ma'lumoti hali kiritilmagan. To'lov uchun sotuvchiga murojaat qiling.");
  }
  return { text: L.join("\n"), done: c.done, hasCards: cards.length > 0 };
}

const MARK = { paid: "✅", late: "⚠️", partial: "🟡", pending: "🕒" };
const LABEL = { paid: "TO'LANDI", late: "KECHIKDI", partial: "QISMAN", pending: "Kutilmoqda" };
const BAR = "━━━━━━━━━━━━━━━━━━";
export const deltaText = (n) => (n === 0 ? "vaqtida" : n > 0 ? `${n} kun kech` : `${-n} kun oldin`);

// To'lovlar jadvali (mijozga ham, egasiga ham)
export function scheduleText(d, c = calc(d)) {
  return c.rows.map((r) => {
    const name = r.n === 0 ? "Oldindan" : `${r.n}-oy`;
    const extra = r.paidOn ? ` (${fmtDate(r.paidOn)} · ${deltaText(r.delta)})` : r.status === "partial" ? ` (${fmt(r.paidAmt, d.currency)} to'langan)` : "";
    return `${MARK[r.status]} ${fmtDate(r.due)} · ${name}: ${fmt(r.amount, d.currency)} — ${LABEL[r.status]}${extra}`;
  }).join("\n");
}

// "MAHSULOT MA'LUMOTLARI" kartochkasi. owner=true bo'lsa xarid narxi va foyda ham ko'rinadi
export function cardText(d, { owner = false } = {}) {
  const c = calc(d);
  const L = [
    "🌟 <b>MAHSULOT MA'LUMOTLARI</b> 🌟", BAR,
    `👤 Mijoz: <b>${esc(d.name)}</b>`,
  ];
  if (d.phone) L.push(`📞 Telefon: ${esc(d.phone)}`);
  if (d.product) L.push(`📦 Mahsulot: ${esc(d.product)}${d.qty > 1 ? ` × ${d.qty}` : ""}`);
  L.push(`🗓 Sotilgan: ${fmtDate(d.saleDate)}`, BAR,
    `💸 Oylik to'lov: <b>${fmt(d.monthly, d.currency)}</b> × ${d.months} oy`,
    `💰 Jami: ${fmt(d.total, d.currency)}`,
    `✅ To'langan: ${fmt(c.paid, d.currency)} (${c.paidMonths}/${d.months} oy)`,
    `📉 Qolgan qarz: <b>${fmt(c.remaining, d.currency)}</b>`);
  if (c.overdue > 0) L.push(`⚠️ Kechikkan: <b>${fmt(c.overdue, d.currency)}</b>`);
  if (owner && d.buyPrice != null)
    L.push(`🏷 Xarid: ${fmt(d.buyPrice, d.currency)} · Foyda: ${fmt(d.total - d.buyPrice, d.currency)}`);
  L.push(BAR, "📋 <b>TO'LOVLAR JADVALI:</b>", "", scheduleText(d, c));
  return L.join("\n");
}

// Qisqa holat (to'lov kiritilgandan keyin)
export function shortText(d) {
  const c = calc(d);
  const L = [
    `<b>${esc(d.name)}</b>`,
    `📆 Oylar: <b>${c.paidMonths}/${d.months}</b> to'langan · ${c.remMonths} oy qoldi` + (c.partial > 0 ? ` (+${fmt(c.partial, d.currency)} qisman)` : ""),
    `✅ To'langan: ${fmt(c.paid, d.currency)}`,
    `📉 Qolgan qarz: <b>${fmt(c.remaining, d.currency)}</b>`,
  ];
  if (c.done) L.push("🎉 Qarz to'liq to'langan");
  else {
    L.push(`⏰ Keyingi to'lov: ${fmtDate(c.nextDue)}`);
    if (c.overdue > 0) L.push(`⚠️ Kechikkan: <b>${fmt(c.overdue, d.currency)}</b>`);
  }
  return L.join("\n");
}

// Mijozga boradigan eslatma: matn (egasi yozgan yoki standart) + qolgan qarz + o'tgan oydagi to'lovlar
export function reminderText(d, intro = DEFAULT_INTRO) {
  const c = calc(d);
  const L = [esc(fillVars(intro, d, c)), "", `💳 Qolgan qarz: <b>${fmt(c.remaining, d.currency)}</b>`];
  if (!c.done && c.nextDue) L.push(`⏰ To'lov sanasi: ${fmtDate(c.nextDue)} · ${fmt(c.dueNow, d.currency)}`);
  if (c.overdue > 0) L.push(`⚠️ Kechikkan: <b>${fmt(c.overdue, d.currency)}</b>`);
  if (c.recent.length) {
    L.push("", "✅ O'tgan oydagi to'lovlaringiz:");
    for (const p of c.recent) L.push(`• ${fmtDate(ymd(p.date))} — ${fmt(p.amount, d.currency)}`);
  }
  return L.join("\n");
}

// Mijozga shaxsiy chatiga yuboradi. Natija: { via, error }
export async function sendReminder(api, d, intro) {
  const text = reminderText(d, intro || (await getTemplate()) || DEFAULT_INTRO);
  const opts = { parse_mode: "HTML" };
  let via = null, error = null;
  if (d.tgId) {
    try { await api.sendMessage(d.tgId, text, { ...opts, reply_markup: payKb(d) }); via = "dm"; }
    catch (e) { error = e.description || e.message; }
  }
  // Qarz ma'lumoti guruhga hech qachon yuborilmaydi: faqat mijozning shaxsiy chatiga
  if (!via && !d.tgId) error = "Mijoz hali botni ochmagan. Unga havola yuboring.";
  if (via) {
    d.lastReminded = todayIst();
    d.messages = [...(d.messages ?? []), { date: new Date().toISOString(), text: intro || "(standart matn)", via }].slice(-20);
    await saveDebtor(d);
    // Egasiga nusxa: xabar aynan nima bo'lib ketganini ko'rsin
    const owner = await getOwner();
    if (owner) api.sendMessage(owner, `📨 <b>${esc(d.name)}</b> ga yuborildi:\n\n${text}`, opts).catch(() => {});
  }
  return { via, error };
}

// ---------- erkin matndan to'lovni o'qish ----------
export { parseAmount, parseMoney };

const CUR_WORD = "\\$|€|₺|dollar|dolar|usd|euro|eur|tl|lira|so'm|som|sum";
const curOf = (w) =>
  /^(\$|dolar|dollar|usd)$/.test(w) ? "USD" : /^(€|euro|eur)$/.test(w) ? "EUR"
  : /^(₺|tl|lira)$/.test(w) ? "TRY" : /^(so'm|som|sum)$/.test(w) ? "UZS" : null;
export const currencyToken = (w) => curOf(fold(w));

// o'zbekcha, turkcha va ruscha kalit so'zlar
const PAY_RE = /oldim|oldik|olindi|tolad(i|ik)|to'lad(i|ik)|to'lab|tolab|tushdi|berdi|keldi|aldim|aldik|alindi|odedi|odendi|tahsil|yatirdi|gonderdi|получил|получен|оплатил|принял/;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (t, name) =>
  new RegExp(`(?<![a-z0-9])${escRe(name)}(?:'?(?:dan|den|tan|ten))?(?![a-z0-9])`).test(t);

export function findPayment(text, debtors) {
  const t = fold(text);
  if (!PAY_RE.test(t)) return null;
  const m = t.match(/(\d[\d.,]*(?:\s*(?:mlrd|mlyard|milliard|mln|million|milyon|ming|k)(?![a-z]))?)\s*(\$|€|₺|dollar|dolar|usd|euro|eur|tl|lira|so'm|som|sum)?/);
  if (!m) return null;
  const amount = parseMoney(m[1]);
  if (!(amount > 0)) return null;
  const anyCur = m[2] || (t.match(new RegExp(`(${CUR_WORD})`)) || [])[1];
  const currency = anyCur ? curOf(anyCur) : null;

  let found = debtors.filter((d) => mentions(t, fold(d.name)));
  if (!found.length)
    found = debtors.filter((d) => {
      const first = fold(d.name).split(" ")[0];
      return first.length >= 3 && mentions(t, first);
    });
  return { amount, currency, found, looksLikePayment: /'?(dan|den|tan|ten)\s*\d/.test(t) };
}

// "ali" kabi yozuvdan mijozni topadi: { d } yoki { err }
export function findDebtor(debtors, query) {
  const q = fold(query).trim();
  if (!q) return { err: "Mijoz ismini yozing." };
  let hits = debtors.filter((d) => fold(d.name) === q);
  if (!hits.length) hits = debtors.filter((d) => fold(d.name).startsWith(q));
  if (!hits.length) hits = debtors.filter((d) => fold(d.name).includes(q));
  if (!hits.length) return { err: `"${query}" ismli mijoz yo'q. /royxat ni ko'ring.` };
  if (hits.length > 1) return { err: "Bir nechta mos keldi: " + hits.map((d) => d.name).join(", ") };
  return { d: hits[0] };
}
