import { Api } from "grammy";
import { getDebtor, requireAuth } from "../lib/core.js";
import { sendReminder } from "../lib/text.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const uid = await requireAuth(req, res);
  if (!uid) return;
  const d = await getDebtor(String(req.body?.id));
  if (!d) return res.status(404).json({ error: "Mijoz topilmadi." });
  const text = String(req.body?.text ?? "").trim().slice(0, 1000) || undefined;
  const { via, error } = await sendReminder(new Api(process.env.BOT_TOKEN), d, text);
  if (!via) return res.status(400).json({ error: error || "Yuborib bo'lmadi." });
  res.json({ ok: true, via });
}
