import { Api } from "grammy";
import { UserError, addExcuse, authUser, getDebtor, getOwner, rateLimited } from "../lib/core.js";
import { esc } from "../lib/text.js";

// Mijoz o'zi yozadigan izoh/uzr (masalan, to'lay olmasa sababi)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const uid = authUser(req);
  if (!uid) return res.status(401).json({ error: "Telegram ichidan oching." });
  if (await rateLimited(uid, 20)) return res.status(429).json({ error: "Juda ko'p so'rov. Biroz kuting." });
  try {
    const d = await getDebtor(String(req.body?.id));
    if (!d || String(d.tgId) !== uid) return res.status(403).json({ error: "Ruxsat yo'q." });
    await addExcuse(d.id, req.body?.text);
    const owner = await getOwner();
    if (owner)
      new Api(process.env.BOT_TOKEN).sendMessage(owner, `💬 <b>${esc(d.name)}</b> yozdi:\n\n${esc(String(req.body.text).slice(0, 500))}`, { parse_mode: "HTML" }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
}
