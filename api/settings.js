import { UserError, addCard, deleteCard, requireAuth, resetInvite, setTemplate } from "../lib/core.js";

// POST {template}  -> standart eslatma matnini saqlaydi (bo'sh bo'lsa asl holatga qaytaradi)
// POST ?relink=ID  -> mijoz havolasini yangilaydi va eski ulanishni uzadi
// POST {card:{number, holder, bank}} -> to'lov kartasini qo'shadi; POST ?delCard=ID -> o'chiradi
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    if (req.query.relink) {
      await resetInvite(String(req.query.relink));
      return res.json({ ok: true });
    }
    if (req.query.delCard) {
      await deleteCard(String(req.query.delCard));
      return res.json({ ok: true });
    }
    if (req.body?.card) return res.json(await addCard(req.body.card, uid));
    await setTemplate(String(req.body?.template ?? "").trim().slice(0, 1000));
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
}
