import { Api } from "grammy";
import { UserError, addHistory, addPayment, calc, editPayment, fmt, fmtDate, getDebtor, requireAuth, undoPayment, ymd } from "../lib/core.js";
import { esc, shortText } from "../lib/text.js";
import { logToBot } from "../lib/notify.js";

// To'lovdan keyin panelda ko'rsatiladigan qisqa natija: nechta oy yopildi, qaysi oyga qancha yetmaydi
function summary(d) {
  const c = calc(d);
  const open = c.rows.find((r) => !r.paidOn);
  const gap = open && open.paidAmt > 0 ? { n: open.n, missing: Math.round((open.amount - open.paidAmt) * 100) / 100 } : null;
  return { paidMonths: c.paidMonths, months: d.months, remaining: fmt(c.remaining, d.currency), done: c.done,
    gap: gap && { n: gap.n, missing: fmt(gap.missing, d.currency) } };
}

export default async function handler(req, res) {
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    if (req.method === "POST") {
      const { id, amount, note, date } = req.body ?? {};
      const { debtor, payment } = await addPayment(String(id), amount, uid, note ?? "", date || undefined);
      if (debtor.tgId) {
        const c = calc(debtor);
        await new Api(process.env.BOT_TOKEN).sendMessage(debtor.tgId,
          `✅ ${fmt(payment.amount, debtor.currency)} to'lovingiz qabul qilindi. Rahmat!\nQolgan qarz: <b>${fmt(c.remaining, debtor.currency)}</b> (${c.paidMonths}/${debtor.months} oy to'langan)` +
            (c.done ? "\n🎉 Qarz to'liq to'landi!" : `\n⏰ Keyingi to'lov: ${fmtDate(c.nextDue)}`),
          { parse_mode: "HTML" }).catch(() => {});
      }
      await logToBot(req, `💵 ${fmt(payment.amount, debtor.currency)} to'lov kiritildi (${fmtDate(ymd(payment.date))})\n\n${shortText(debtor)}`);
      return res.json({ ok: true, summary: summary(debtor) });
    }
    if (req.method === "PUT") {
      const { id, pid, amount, date, note } = req.body ?? {};
      const old = (await getDebtor(String(id)))?.payments.find((p) => p.id === String(pid));
      const before = old && { amount: old.amount, date: ymd(old.date) };
      const d = await editPayment(String(id), String(pid), { amount, date, note });
      const p = d.payments.find((x) => x.id === String(pid));
      const show = (x) => `${fmt(x.amount, d.currency)} (${fmtDate(x.date)})`;
      await addHistory(d.id, uid, `To'lov tuzatildi: ${before ? show(before) + " → " : ""}${show({ amount: p.amount, date: ymd(p.date) })}`);
      await logToBot(req, `✏️ <b>${esc(d.name)}</b> — to'lov tuzatildi: ${before ? show(before) + " → " : ""}${show({ amount: p.amount, date: ymd(p.date) })}\n\n${shortText(d)}`);
      return res.json({ ok: true, summary: summary(d) });
    }
    if (req.method === "DELETE") {
      const old = (await getDebtor(String(req.query.id)))?.payments.find((p) => p.id === String(req.query.pid));
      const d = await undoPayment(String(req.query.id), String(req.query.pid));
      await addHistory(d.id, uid, `To'lov bekor qilindi${old ? `: ${fmt(old.amount, d.currency)} (${fmtDate(ymd(old.date))})` : ""}`);
      await logToBot(req, `↩️ <b>${esc(d.name)}</b> — ${old ? fmt(old.amount, d.currency) + " " : ""}to'lov bekor qilindi\n\n${shortText(d)}`);
      return res.json({ ok: true, summary: summary(d) });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
}
