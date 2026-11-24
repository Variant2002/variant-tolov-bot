import { POOLS, calc, fmt, getHomeGroup, redis, tag } from "./core.js";
import { esc } from "./text.js";

// "Kirdi-chiqdi" mavzulari (topic): har bir aborot uchun guruhdagi mavzu.
// Guruh mavzusida /kirdichiqdi (VARIANT), /kirdichiqdi L yoki /kirdichiqdi Q yoziladi.
export const getTopic = async (pool) => {
  const v = await redis.get(`cfg:topic:${pool}`);
  return v == null ? null : Number(v);
};
export const setTopic = (pool, thread) => redis.set(`cfg:topic:${pool}`, String(thread ?? 0));
export const listTopics = async () => {
  const out = {};
  for (const p of Object.keys(POOLS)) out[p] = await getTopic(p);
  return out;
};

// Shu xabar aynan shu aborotning kirdi-chiqdi mavzusidan kelganmi (unda bot qayta yozmaydi: odam o'zi yozgan)
export async function isPoolTopic(chatId, threadId, pool) {
  const home = await getHomeGroup();
  if (!home || String(chatId) !== home) return false;
  const t = await getTopic(pool);
  return t != null && Number(threadId ?? 0) === t;
}

async function post(api, pool, text) {
  const home = await getHomeGroup();
  if (!home) return false;
  let t = await getTopic(pool);
  if (t == null && pool !== "V") t = await getTopic("V"); // L/Q mavzusi belgilanmagan bo'lsa asosiy kirdi-chiqdiga
  if (t == null) return false; // hech qaysi mavzu belgilanmagan: guruhga yozilmaydi
  await api.sendMessage(home, text, { parse_mode: "HTML", ...(t ? { message_thread_id: t } : {}) }).catch((e) => console.error("guruhga yozilmadi:", e.description ?? e.message));
  return true;
}

const FROM = { V: "VARIANT aborotidan", L: "L-aborotdan", Q: "Qarz aborotidan" };
const who = (d) => `${tag(d)} ${esc(d.name)}`.trim();

// To'lov: "#50 Ism $300 berdi"
export function announcePayment(api, d, amount) {
  const c = calc(d);
  return post(api, d.pool, `${who(d)} ${fmt(amount, d.currency)} berdi` + (c.done ? " · ✅ qarz yopildi" : ` · qoldi ${fmt(c.remaining, d.currency)}`));
}

export const announceUndo = (api, d, amount) =>
  post(api, d.pool, `↩️ ${who(d)} ${fmt(amount, d.currency)} to'lov bekor qilindi`);

export const announceEdit = (api, d, before, after) =>
  post(api, d.pool, `✏️ ${who(d)} to'lov tuzatildi: ${fmt(before, d.currency)} → ${fmt(after, d.currency)}`);

// Yangi BAY: qaysi aborotdan, tan narxi qancha chiqdi, qaysi mahsulotga. Boshlang'ich bo'lsa alohida qator.
export async function announceSale(api, d) {
  const L = [`🛒 BAY ${who(d)}`];
  if (d.product) L.push(`📦 ${esc(d.product)}`);
  if (d.buyPrice != null) L.push(`💸 ${FROM[d.pool] ?? POOLS[d.pool]} ${fmt(d.buyPrice, d.currency)} chiqdi (tan narxi)`);
  L.push(`🧾 ${fmt(d.total, d.currency)} · ${d.months} oy × ${fmt(d.monthly, d.currency)}`);
  await post(api, d.pool, L.join("\n"));
  if (d.down > 0) await post(api, d.pool, `${who(d)} ${fmt(d.down, d.currency)} boshlang'ich`);
}
