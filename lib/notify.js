import { Api } from "grammy";
import { getHomeGroup, getOwner, personName, reqUser } from "./core.js";
import { esc } from "./text.js";

// Panelda qilingan har bir o'zgarish botga ham yoziladi: biriktirilgan guruhga, guruh bo'lmasa egasining chatiga.
// Kim qilgani har doim ko'rsatiladi (masalan "👤 Abubakr").
// Vercel javobdan keyin funksiyani to'xtatadi, shuning uchun javob berishdan oldin await qilinadi.
export async function logToBot(req, text) {
  const to = (await getHomeGroup()) ?? (await getOwner());
  if (!to) return;
  const by = personName(reqUser(req));
  await new Api(process.env.BOT_TOKEN)
    .sendMessage(to, `👤 <b>${esc(by || "Noma'lum")}</b> · 📊 panelda\n${text}`, { parse_mode: "HTML" })
    .catch((e) => console.error("botga yozilmadi:", e.description ?? e.message));
}
