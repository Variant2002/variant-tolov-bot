import { Api } from "grammy";
import { getOwner, listDebtors, shouldRemind, todayIst } from "../lib/core.js";
import { esc, PRE_INTRO, sendReminder } from "../lib/text.js";

// Vercel Cron har kuni chaqiradi: to'lov kunidan bir kun oldin, to'lov kuni va 7 kunda bir kechikkanlarga eslatma ketadi.
export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).end();

  const api = new Api(process.env.BOT_TOKEN);
  const today = todayIst();
  const ok = [], fail = [];
  for (const d of await listDebtors()) {
    const kind = shouldRemind(d, today);
    if (!kind) continue;
    const r = await sendReminder(api, d, kind === "pre" ? PRE_INTRO : undefined);
    (r.via ? ok : fail).push(d.name);
  }

  const owner = await getOwner();
  if (owner && fail.length) {
    // Muvaffaqiyatli yuborilganlarning nusxasi sendReminder ichida egasiga allaqachon boradi
    await api.sendMessage(owner, `❌ Eslatma yetmadi: ${esc(fail.join(", "))}\nBu mijozlar botni hali ochmagan — ularga havola yuboring.`, { parse_mode: "HTML" }).catch(() => {});
  }
  res.json({ today, sent: ok, failed: fail });
}
