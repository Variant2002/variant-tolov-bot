import { UserError, addHistory, dueDate, fmtDate, requireAuth, setDueOverride } from "../lib/core.js";
import { esc } from "../lib/text.js";
import { logToBot } from "../lib/notify.js";

// POST {id, n, date} -> n-oy to'lovining muddatini ko'chiradi; date bo'sh bo'lsa asl sanaga qaytaradi
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    const { id, n, date } = req.body ?? {};
    const d = await setDueOverride(String(id), n, date || null);
    const k = Math.floor(Number(n));
    await addHistory(d.id, uid, `${k}-oy to'lov sanasi ${date ? "o'zgartirildi" : "asl sanaga qaytarildi"}: ${fmtDate(dueDate(d, k - 1))}`);
    await logToBot(req, `📅 <b>${esc(d.name)}</b> — ${k}-oy to'lov sanasi ${date ? "o'zgartirildi" : "asl sanaga qaytarildi"}: <b>${fmtDate(dueDate(d, k - 1))}</b>`);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
}
