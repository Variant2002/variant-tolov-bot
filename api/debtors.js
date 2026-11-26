import {
  UserError, authUser, calc, claimOwner, createDebtor, deleteDebtor, fmt, fmtDate, getDebtor, getNames, getOwner, rememberName, reqUser, updateDebtor, addHistory, getTemplate, isAuthorized, listCards, listDebtors, rateLimited, requireAuth,
} from "../lib/core.js";
import { DEFAULT_INTRO, PRESETS } from "../lib/text.js";
import { demoDebtors } from "../lib/demo.js";
import { esc } from "../lib/text.js";
import { logToBot } from "../lib/notify.js";

// Mijozga faqat karta raqami, egasining ismi va bank ko'rinadi (kim qo'shgani emas)
const publicCard = (k) => ({ id: k.id, number: k.number, holder: k.holder, bank: k.bank });

// Egasi ko'radigan to'liq ko'rinish
// names: uid -> ism (kim qo'shgani va kim to'lov kiritgani ko'rinsin)
const ownerView = (d, names = {}) => ({
  addedBy: names[d.by] ?? "",
  id: d.id, inv: d.inv ?? d.id, name: d.name, phone: d.phone ?? "", product: d.product ?? "", qty: d.qty ?? 1, code: d.code ?? "",
  pool: d.pool ?? "", note: d.note ?? "", currency: d.currency, buyPrice: d.buyPrice ?? null, total: d.total, down: d.down, months: d.months,
  monthly: d.monthly, saleDate: d.saleDate, firstDue: d.firstDue, overrides: d.overrides ?? {}, linked: !!d.tgId, inGroup: !!d.chatId,
  payments: [...d.payments].reverse().map((p) => ({ ...p, byName: names[p.by] ?? "" })),
  excuses: [...d.excuses].reverse(), messages: [...d.messages].reverse(), c: calc(d),
  history: [...(d.history ?? [])].reverse().map((h) => ({ date: h.date, text: h.text, byName: names[h.by] ?? "" })),
});

// Mijozning o'zi ko'radigan ko'rinish (xarid narxi va foyda yo'q)
const customerView = (d) => ({
  id: d.id, name: d.name, product: d.product ?? "", qty: d.qty ?? 1, currency: d.currency, total: d.total, months: d.months,
  monthly: d.monthly, saleDate: d.saleDate, payments: [...d.payments].reverse().map((p) => ({ id: p.id, amount: p.amount, date: p.date })),
  excuses: [...d.excuses].reverse(),
  c: (() => { const c = calc(d); return { ...c, recent: c.recent.map((p) => ({ amount: p.amount, date: p.date })) }; })(),
});

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const uid = authUser(req);
      if (!uid) return res.status(401).json({ error: "Telegram ichidan oching." });
      if (await rateLimited(uid)) return res.status(429).json({ error: "Juda ko'p so'rov. Biroz kuting." });
      if (!(await getOwner())) await claimOwner(uid);
      const all = await listDebtors();
      if (await isAuthorized(uid)) {
        await rememberName(uid, reqUser(req));
        const names = await getNames();
        return res.json({ role: "owner", bot: process.env.BOT_USERNAME, template: (await getTemplate()) || DEFAULT_INTRO,
          defaultTemplate: DEFAULT_INTRO, presets: PRESETS, cards: (await listCards()).map(publicCard), debtors: all.map((d) => ownerView(d, names)) });
      }
      const mine = all.filter((d) => String(d.tgId) === uid);
      if (mine.length) return res.json({ role: "customer", cards: (await listCards()).map(publicCard), debtors: mine.map(customerView) });
      // Ruxsati yo'q odam: namuna rejim (soxta mijozlar, hech narsa saqlanmaydi)
      return res.json({ role: "owner", demo: true, bot: process.env.BOT_USERNAME, template: DEFAULT_INTRO,
        defaultTemplate: DEFAULT_INTRO, presets: PRESETS, cards: [], debtors: demoDebtors().map((d) => ownerView(d)) });
    }

    const uid = await requireAuth(req, res);
    if (!uid) return;
    if (req.method === "POST") {
      const d = await createDebtor({ ...(req.body ?? {}), by: uid });
      await logToBot(req, `➕ Yangi mijoz: <b>${esc(d.name)}</b>${d.product ? " · " + esc(d.product) : ""}\n🧾 ${fmt(d.total, d.currency)}` +
        (d.down > 0 ? ` (oldindan ${fmt(d.down, d.currency)})` : "") + ` · ${d.months} oy × ${fmt(d.monthly, d.currency)}\n⏰ 1-to'lov: ${fmtDate(d.firstDue)}`);
      return res.json(ownerView(d, await getNames()));
    }
    if (req.method === "PUT") {
      const { id, name, phone, product, code, note } = req.body ?? {};
      const { d, before } = await updateDebtor(String(id), { name, phone, product, code, note });
      const LBL = { name: "Ism", phone: "Telefon", product: "Mahsulot", code: "ID", note: "Izoh" };
      const keys = Object.keys(LBL).filter((k) => (before[k] ?? "") !== (d[k] ?? ""));
      if (keys.length) {
        await addHistory(d.id, uid, keys.map((k) => `${LBL[k]}: ${before[k] || "—"} → ${d[k] || "—"}`).join("; "));
        await logToBot(req, `✏️ <b>${esc(d.name)}</b> ma'lumoti o'zgartirildi\n` +
          keys.map((k) => `${LBL[k]}: ${esc(before[k] || "—")} → <b>${esc(d[k] || "—")}</b>`).join("\n"));
      }
      return res.json({ ok: true });
    }
    if (req.method === "DELETE") {
      const d = await getDebtor(String(req.query.id));
      await deleteDebtor(String(req.query.id));
      if (d) await logToBot(req, `🗑 Mijoz o'chirildi: <b>${esc(d.name)}</b>`);
      return res.json({ ok: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
}
