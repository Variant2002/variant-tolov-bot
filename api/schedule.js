import { UserError, requireAuth, setDueOverride } from "../lib/core.js";

// POST {id, n, date} -> n-oy to'lovining muddatini ko'chiradi; date bo'sh bo'lsa asl sanaga qaytaradi
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    const { id, n, date } = req.body ?? {};
    await setDueOverride(String(id), n, date || null);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
}
