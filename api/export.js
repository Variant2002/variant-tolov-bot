import { Api, InputFile } from "grammy";
import { listDebtors, requireAuth } from "../lib/core.js";
import { buildWorkbook } from "../lib/excel.js";

// Excel faylni yaratib, so'ragan odamning Telegram chatiga yuboradi
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    const buf = await buildWorkbook(await listDebtors());
    await new Api(process.env.BOT_TOKEN).sendDocument(uid, new InputFile(Buffer.from(buf), "qarzlar.xlsx"),
      { caption: "📥 Hamma mijozlar, to'lovlar va jadval" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Excel yuborib bo'lmadi. Botga avval /start yozing." });
  }
}
