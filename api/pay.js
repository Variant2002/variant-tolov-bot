import { Api } from "grammy";
import { UserError, addPayment, calc, editPayment, fmt, fmtDate, requireAuth, undoPayment } from "../lib/core.js";

export default async function handler(req, res) {
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    if (req.method === "POST") {
      const { id, amount, note, date } = req.body ?? {};
      const { debtor } = await addPayment(String(id), amount, uid, note ?? "", date || undefined);
      if (debtor.tgId) {
        const c = calc(debtor);
        new Api(process.env.BOT_TOKEN).sendMessage(debtor.tgId,
          `✅ ${fmt(debtor.payments.at(-1).amount, debtor.currency)} to'lovingiz qabul qilindi. Rahmat!\nQolgan qarz: <b>${fmt(c.remaining, debtor.currency)}</b> (${c.paidMonths}/${debtor.months} oy to'langan)` +
            (c.done ? "\n🎉 Qarz to'liq to'landi!" : `\n⏰ Keyingi to'lov: ${fmtDate(c.nextDue)}`),
          { parse_mode: "HTML" }).catch(() => {});
      }
      return res.json({ ok: true });
    }
    if (req.method === "PUT") {
      const { id, pid, amount, date, note } = req.body ?? {};
      await editPayment(String(id), String(pid), { amount, date, note });
      return res.json({ ok: true });
    }
    if (req.method === "DELETE") {
      await undoPayment(String(req.query.id), String(req.query.pid));
      return res.json({ ok: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
}
