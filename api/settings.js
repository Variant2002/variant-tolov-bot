import { UserError, addCard, addHistory, deleteCard, listCards, requireAuth, resetInvite, setTemplate } from "../lib/core.js";
import { esc } from "../lib/text.js";
import { logToBot } from "../lib/notify.js";

const last4 = (n) => "•••• " + String(n).slice(-4);

// POST {template}  -> standart eslatma matnini saqlaydi (bo'sh bo'lsa asl holatga qaytaradi)
// POST ?relink=ID  -> mijoz havolasini yangilaydi va eski ulanishni uzadi
// POST {card:{number, holder, bank}} -> to'lov kartasini qo'shadi; POST ?delCard=ID -> o'chiradi
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    if (req.query.relink) {
      const d = await resetInvite(String(req.query.relink));
      await addHistory(d.id, uid, "Havola yangilandi (eski ulanish uzildi)");
      await logToBot(req, `♻️ <b>${esc(d.name)}</b> havolasi yangilandi (eski ulanish uzildi)`);
      return res.json({ ok: true });
    }
    if (req.query.delCard) {
      const k = (await listCards()).find((c) => c.id === String(req.query.delCard));
      await deleteCard(String(req.query.delCard));
      if (k) await logToBot(req, `💳 Karta o'chirildi: ${last4(k.number)}`);
      return res.json({ ok: true });
    }
    if (req.body?.card) {
      const k = await addCard(req.body.card, uid);
      await logToBot(req, `💳 Karta qo'shildi: ${last4(k.number)}${k.bank ? " · " + esc(k.bank) : ""}`);
      return res.json(k);
    }
    const tpl = String(req.body?.template ?? "").trim().slice(0, 1000);
    await setTemplate(tpl);
    await logToBot(req, tpl ? "✉️ Eslatma matni o'zgartirildi" : "✉️ Eslatma matni asl holatga qaytarildi");
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
}
