import {
  UserError, authUser, calc, claimOwner, createDebtor, deleteDebtor, getOwner, getTemplate, isAuthorized, listCards, listDebtors, rateLimited, requireAuth,
} from "../lib/core.js";
import { DEFAULT_INTRO, PRESETS } from "../lib/text.js";
import { demoDebtors } from "../lib/demo.js";

// Mijozga faqat karta raqami, egasining ismi va bank ko'rinadi (kim qo'shgani emas)
const publicCard = (k) => ({ id: k.id, number: k.number, holder: k.holder, bank: k.bank });

// Egasi ko'radigan to'liq ko'rinish
const ownerView = (d) => ({
  id: d.id, inv: d.inv ?? d.id, name: d.name, phone: d.phone ?? "", product: d.product ?? "", qty: d.qty ?? 1, code: d.code ?? "",
  pool: d.pool ?? "", note: d.note ?? "", currency: d.currency, buyPrice: d.buyPrice ?? null, total: d.total, down: d.down, months: d.months,
  monthly: d.monthly, saleDate: d.saleDate, firstDue: d.firstDue, overrides: d.overrides ?? {}, linked: !!d.tgId, inGroup: !!d.chatId,
  payments: [...d.payments].reverse(), excuses: [...d.excuses].reverse(), messages: [...d.messages].reverse(), c: calc(d),
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
      if (await isAuthorized(uid))
        return res.json({ role: "owner", bot: process.env.BOT_USERNAME, template: (await getTemplate()) || DEFAULT_INTRO,
          defaultTemplate: DEFAULT_INTRO, presets: PRESETS, cards: (await listCards()).map(publicCard), debtors: all.map(ownerView) });
      const mine = all.filter((d) => String(d.tgId) === uid);
      if (mine.length) return res.json({ role: "customer", cards: (await listCards()).map(publicCard), debtors: mine.map(customerView) });
      // Ruxsati yo'q odam: namuna rejim (soxta mijozlar, hech narsa saqlanmaydi)
      return res.json({ role: "owner", demo: true, bot: process.env.BOT_USERNAME, template: DEFAULT_INTRO,
        defaultTemplate: DEFAULT_INTRO, presets: PRESETS, cards: [], debtors: demoDebtors().map(ownerView) });
    }

    const uid = await requireAuth(req, res);
    if (!uid) return;
    if (req.method === "POST") return res.json(ownerView(await createDebtor(req.body ?? {})));
    if (req.method === "DELETE") {
      await deleteDebtor(String(req.query.id));
      return res.json({ ok: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
}
