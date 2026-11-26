import { Api, InputFile } from "grammy";
import { getHomeGroup, listDebtors, requireAuth } from "../lib/core.js";
import { buildWorkbook } from "../lib/excel.js";

// Excel faylni yaratib, biriktirilgan guruhga yuboradi (guruh bo'lmasa so'ragan odamning chatiga)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const uid = await requireAuth(req, res);
  if (!uid) return;
  const group = await getHomeGroup();
  try {
    const buf = await buildWorkbook(await listDebtors());
    await new Api(process.env.BOT_TOKEN).sendDocument(group ?? uid, new InputFile(Buffer.from(buf), "qarzlar.xlsx"),
      { caption: "📥 Hamma mijozlar, to'lovlar va jadval" });
    res.json({ ok: true, to: group ? "group" : "chat" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: group ? "Excel guruhga yuborilmadi. Bot guruhda borligini tekshiring." : "Excel yuborib bo'lmadi. Botga avval /start yozing." });
  }
}
