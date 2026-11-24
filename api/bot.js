import { Bot, InlineKeyboard, InputFile, webhookCallback } from "grammy";
import {
  UserError, addExcuse, addPayment, calc, claimOwner, createClaim, createDebtor, deleteDebtor, findByInvite,
  fmt, fmtDate, getDebtor, takeClaim, getHomeGroup, getOwner, isAuthorized, listDebtors, lockHomeGroup, normDate, saveDebtor, undoPayment,
} from "../lib/core.js";
import {
  cardText, cardsText, currencyToken, esc, findDebtor, findPayment, parseMoney, payKb, sendReminder, shortText,
} from "../lib/text.js";
import { buildWorkbook } from "../lib/excel.js";

const { BOT_TOKEN, WEBAPP_URL, WEBHOOK_SECRET } = process.env;
const bot = new Bot(BOT_TOKEN);
const HTML = { parse_mode: "HTML" };

const HELP = `<b>Buyruqlar</b> (faqat egasi va vakillar uchun)
/yangi Ism Jami Oy [valyuta] [1-to'lov sanasi]
  masalan: <code>/yangi Ism 34320 12 25.11.2026</code>
  (to'liq ma'lumot — mahsulot, telefon, xarid narxi — uchun /panel dan foydalaning)
/royxat — hamma mijozlar holati
/qarz Ism — mijoz kartochkasi va jadvali
/tolov Ism Summa — to'lov kiritish
/eslat — kechikkanlarga qarz haqida xabar
/eslat Ism — bitta mijozga xabar
/eslat Ism: o'z matningiz — o'zingiz yozgan matn bilan
/havola Ism — mijoz uchun maxsus havola
/excel — hamma ma'lumotni Excel faylda olish
/ochir Ism — mijozni o'chirish
/panel — panelni ochish
/guruh — (faqat egasi) botni shu guruhga biriktirish. Bir marta qilinadi, keyin boshqa guruhga ko'chirib bo'lmaydi.
Biriktirilgan guruh a'zolari hammasini qila oladi: mijoz qo'shish, to'lov kiritish, xabar yuborish.

<b>Guruhdan:</b> botni guruhga qo'shib yozing:
<i>[Ism]dan 200 dollar oldim</i>
Bot qarzdan ayiradi va qolganini aytadi.`;

const errText = (e) => (e instanceof UserError ? e.message : "Xatolik yuz berdi, qayta urinib ko'ring.");
const isPrivate = (ctx) => ctx.chat?.type === "private";
const panelKb = (text = "📊 Panelni ochish") => new InlineKeyboard().webApp(text, WEBAPP_URL);
// Mijoz xabarlari ostidagi tugmalar: to'lov qilish + shaxsiy panel
const customerKb = (d) => payKb(d).row().webApp("📊 Mening to'lovlarim", WEBAPP_URL);
const inviteLink = (ctx, d) => `https://t.me/${ctx.me.username}?start=d_${d.inv ?? d.id}`;

const admin = (fn) => async (ctx) => {
  if (!ctx.from || !(await isAuthorized(ctx.from.id))) return ctx.reply("⛔ Bu buyruq faqat egasi va vakillar uchun.");
  try { await fn(ctx); } catch (e) { await ctx.reply(errText(e)); if (!(e instanceof UserError)) console.error(e); }
};

const pickDebtor = async (name) => {
  const r = findDebtor(await listDebtors(), name);
  if (r.err) throw new UserError(r.err);
  return r.d;
};

// Maxfiy ma'lumot (karta, ro'yxat, havola, Excel) guruhda emas, faqat so'ragan odamning shaxsiy chatida ko'rsatiladi
const priv = (fn) => async (ctx) => {
  if (isPrivate(ctx)) return fn(ctx);
  const groupId = ctx.chat.id, uid = ctx.from.id;
  let failed = false;
  ctx.reply = (text, other) => ctx.api.sendMessage(uid, text, other).catch(() => { failed = true; });
  ctx.replyWithDocument = (doc, other) => ctx.api.sendDocument(uid, doc, other).catch(() => { failed = true; });
  await fn(ctx);
  await ctx.api.sendMessage(groupId, failed ? "Avval botga shaxsiy chatda /start yozing, so'ng qayta urinib ko'ring." : "📩 Javob shaxsiy chatingizga yuborildi.").catch(() => {});
};

// Bot faqat biriktirilgan guruhda ishlaydi: boshqa guruhga qo'shilsa o'zi chiqib ketadi.
// Guruh biriktirilmaguncha guruhlarda faqat egasining /guruh buyrug'i ishlaydi (ma'lumot sizib chiqmasligi uchun).
bot.use(async (ctx, next) => {
  const chat = ctx.chat;
  if (chat && chat.type !== "private") {
    const home = await getHomeGroup();
    if (home && String(chat.id) !== home) {
      await ctx.api.leaveChat(chat.id).catch(() => {});
      return;
    }
    if (!home && !/^\/guruh(@\w+)?(\s|$)/.test(ctx.message?.text ?? "")) return;
  }
  return next();
});

bot.command("guruh", async (ctx) => {
  if (!ctx.from || (await getOwner()) !== String(ctx.from.id)) return ctx.reply("⛔ Buni faqat bot egasi qila oladi.");
  if (isPrivate(ctx))
    return ctx.reply("Botni kerakli guruhga qo'shing (admin qilsangiz yaxshi) va o'sha guruhda /guruh deb yozing.\nBot faqat shu guruh bilan ishlaydi va keyin boshqa joyga ko'chirib bo'lmaydi.");
  const home = await getHomeGroup();
  if (home) return ctx.reply(home === String(ctx.chat.id) ? "✅ Bot allaqachon shu guruhga biriktirilgan." : "⛔ Bot boshqa guruhga biriktirilgan, uni o'zgartirib bo'lmaydi.");
  await lockHomeGroup(ctx.chat.id);
  await ctx.reply("🔒 Bot shu guruhga biriktirildi.\nEndi guruh a'zolari mijozlar, to'lovlar va xabarlar bilan ishlay oladi. Bot boshqa guruhlarda ishlamaydi.\n\nTavsiya: botni guruhda admin qiling, shunda a'zolarni to'g'ri tekshira oladi.");
});

// ---------- /start ----------
bot.command("start", async (ctx) => {
  if (!isPrivate(ctx)) return ctx.reply("Assalomu alaykum! Buyruqlar uchun /yordam");
  const payload = ctx.match;

  if (payload.startsWith("d_")) {
    const d = await findByInvite(payload.slice(2));
    if (!d) return ctx.reply("Bu havola yaroqsiz yoki bekor qilingan.");
    if (d.tgId && String(d.tgId) !== String(ctx.from.id)) return ctx.reply("Bu havola boshqa odam tomonidan ishlatilgan.");
    d.tgId = ctx.from.id;
    d.username = ctx.from.username ?? null;
    await saveDebtor(d);
    const owner = await getOwner();
    if (owner) bot.api.sendMessage(owner, `🔗 ${esc(d.name)} botni ochdi — endi unga xabar yuborish mumkin.`, HTML).catch(() => {});
    return ctx.reply(`Assalomu alaykum, ${esc(d.name)}! 👋\n\n${cardText(d)}\n\nEslatmalar shu yerga keladi. Savol yoki izoh (masalan, to'lay olmasangiz sababi) bo'lsa, shu yerga yozing — egasiga yetkaziladi.\n\n🔒 Ma'lumotlaringiz faqat sizga va sotuvchiga ko'rinadi. Maxfiylik: /maxfiylik · Ma'lumotni o'chirish so'rovi: /meniochir`,
      { ...HTML, reply_markup: customerKb(d) });
  }

  if (await claimOwner(ctx.from.id))
    return ctx.reply("👑 Siz bot egasi bo'ldingiz. Panelni oching yoki /yordam ni yozing.", { reply_markup: panelKb() });

  if (await isAuthorized(ctx.from.id))
    return ctx.reply("Assalomu alaykum! Panelni oching yoki /yordam ni yozing.", { reply_markup: panelKb() });

  const mine = (await listDebtors()).filter((d) => String(d.tgId) === String(ctx.from.id));
  return ctx.reply(mine.length ? "Qarz holatingiz uchun /qarzim ni yozing." : "Bu bot yopiq. Sizga yuborilgan maxsus havola orqali kiring.",
    mine.length ? { reply_markup: panelKb("📊 Mening to'lovlarim") } : undefined);
});

bot.command("yordam", (ctx) => ctx.reply(HELP, HTML));
bot.command("panel", admin(async (ctx) => {
  if (!isPrivate(ctx)) return ctx.reply("Panelni ochish uchun botga shaxsiy chatda /panel yozing.");
  await ctx.reply("Panel:", { reply_markup: panelKb() });
}));

bot.command("qarzim", priv(async (ctx) => {
  const mine = (await listDebtors()).filter((d) => String(d.tgId) === String(ctx.from.id));
  if (!mine.length) return ctx.reply("Sizning nomingizda qarz topilmadi.");
  for (const d of mine) await ctx.reply(cardText(d), { ...HTML, reply_markup: isPrivate(ctx) ? customerKb(d) : undefined });
}));

bot.command("maxfiylik", (ctx) => ctx.reply(
  `🔒 <b>Maxfiylik</b>\nSaqlanadigan ma'lumot: ismingiz, telefon (agar berilgan bo'lsa), Telegram ID, xarid va to'lovlar tarixi, yozgan izohlaringiz.\nMaqsad: qarz va to'lovlarni hisobga olish, eslatma yuborish.\nKim ko'radi: faqat siz va sotuvchi (va u ruxsat bergan xodimlar). Uchinchi shaxslarga berilmaydi.\nHuquqlaringiz: ma'lumotingizni ko'rish (/qarzim) va o'chirishni so'rash (/meniochir). Faol qarz bo'lsa, hisob-kitob uchun saqlanishi mumkin.\n\nBatafsil: ${WEBAPP_URL}/privacy.html`, HTML));

// Mijoz o'z ma'lumotini o'chirishni so'raydi: so'rov sotuvchiga boradi (faol qarz bo'lsa sotuvchi hal qiladi)
bot.command("meniochir", async (ctx) => {
  if (!isPrivate(ctx)) return;
  const mine = (await listDebtors()).filter((d) => String(d.tgId) === String(ctx.from.id));
  if (!mine.length) return ctx.reply("Sizning nomingizda ma'lumot topilmadi.");
  const owner = await getOwner();
  if (owner) await bot.api.sendMessage(owner, `🗑 <b>${esc(mine[0].name)}</b> ma'lumotini o'chirishni so'radi. Kerak bo'lsa panelda "Mijozni o'chirish"ni bosing.`, HTML).catch(() => {});
  await ctx.reply("So'rovingiz sotuvchiga yuborildi ✅. Agar qarzingiz to'liq to'langan bo'lsa, ma'lumotlaringiz o'chiriladi.");
});

// ---------- mijozlar ----------
bot.command("yangi", admin(priv(async (ctx) => {
  const t = ctx.match.trim().split(/\s+/).filter(Boolean);
  const i = t.findIndex((x) => /^\d/.test(x));
  if (i < 1 || t.length < i + 2)
    return ctx.reply("Foydalanish: <code>/yangi Ism Jami Oy [valyuta] [1-to'lov sanasi]</code>\nMasalan: <code>/yangi Ism 34320 12 25.11.2026</code>", HTML);
  let currency = "USD", firstDue;
  for (const x of t.slice(i + 2)) {
    const c = currencyToken(x) ?? (/^(usd|eur|try|uzs)$/i.test(x) ? x.toUpperCase() : null);
    if (c) currency = c; else firstDue = normDate(x, { future: true }) ?? firstDue;
  }
  const d = await createDebtor({
    name: t.slice(0, i).join(" "), total: parseMoney(t[i]), months: parseInt(t[i + 1], 10),
    currency, firstDue, chatId: isPrivate(ctx) ? null : ctx.chat.id,
  });
  await ctx.reply(`➕ Qo'shildi\n\n${cardText(d, { owner: true })}\n\n🔗 Mijoz uchun havola (bosganda unga xabar yuborish mumkin bo'ladi):\n${inviteLink(ctx, d)}`, HTML);
})));

bot.command("royxat", admin(priv(async (ctx) => {
  const list = (await listDebtors()).map((d) => ({ d, c: calc(d) })).sort((a, b) => b.c.overdue - a.c.overdue || b.c.remaining - a.c.remaining);
  if (!list.length) return ctx.reply("Hali hech kim yo'q. /panel orqali qo'shing.");
  const lines = list.map(({ d, c }) =>
    `${c.done ? "✅" : c.overdue > 0 ? "⚠️" : "•"} <b>${esc(d.name)}</b> ${c.paidMonths}/${d.months} · qolgan ${fmt(c.remaining, d.currency)}`);
  const sums = {};
  for (const { d, c } of list) { sums[d.currency] ??= { rem: 0, paid: 0 }; sums[d.currency].rem += c.remaining; sums[d.currency].paid += c.paid; }
  const total = Object.entries(sums).map(([cur, s]) => `Yig'ilgan: ${fmt(s.paid, cur)} · Qolgan: <b>${fmt(s.rem, cur)}</b>`).join("\n");
  await ctx.reply(`${lines.join("\n")}\n\n${total}`.slice(0, 4000), HTML);
})));

bot.command("qarz", admin(priv(async (ctx) => {
  await ctx.reply(cardText(await pickDebtor(ctx.match), { owner: true }), HTML);
})));

bot.command("tolov", admin(async (ctx) => {
  const t = ctx.match.trim().split(/\s+/).filter(Boolean);
  // "Ism 500" yoki "Ism 2 mln" (harfli summa)
  const two = t.length >= 3 && /^\d/.test(t.at(-2)) && /^[a-z]+$/i.test(t.at(-1));
  const amount = parseMoney(two ? `${t.at(-2)} ${t.at(-1)}` : t.at(-1) ?? "");
  if (t.length < 2 || !(amount > 0)) return ctx.reply("Foydalanish: <code>/tolov Ism Summa</code> (masalan: 500 yoki 2 mln)", HTML);
  await recordPayment(ctx, await pickDebtor(t.slice(0, two ? -2 : -1).join(" ")), amount);
}));

bot.command("havola", admin(priv(async (ctx) => {
  const d = await pickDebtor(ctx.match);
  await ctx.reply(`${esc(d.name)} uchun havola:\n${inviteLink(ctx, d)}\n\n${d.tgId ? "✅ Ulangan" : "⏳ Hali ulanmagan"}`, HTML);
})));

bot.command("eslat", admin(async (ctx) => {
  const arg = ctx.match.trim();
  const all = await listDebtors();
  let targets, intro;
  if (!arg) targets = all.filter((d) => calc(d).overdue > 0);
  else {
    const [name, ...rest] = arg.split(":");
    targets = [await pickDebtor(name)];
    intro = rest.join(":").trim() || undefined;
  }
  if (!targets.length) return ctx.reply("Kechikkan mijoz yo'q 🎉");
  const ok = [], fail = [];
  for (const d of targets) {
    const r = await sendReminder(bot.api, d, intro);
    (r.via ? ok : fail).push(r.via ? d.name : `${d.name} (${r.error})`);
  }
  await ctx.reply((ok.length ? `📨 Yuborildi: ${ok.join(", ")}\n` : "") + (fail.length ? `❌ Yetmadi: ${fail.join("; ")}` : ""));
}));

bot.command("excel", admin(priv(async (ctx) => {
  const buf = await buildWorkbook(await listDebtors());
  await ctx.replyWithDocument(new InputFile(Buffer.from(buf), "qarzlar.xlsx"), { caption: "📥 Hamma mijozlar, to'lovlar va jadval" });
})));

bot.command("ochir", admin(async (ctx) => {
  const d = await pickDebtor(ctx.match);
  const kb = new InlineKeyboard().text("🗑 Ha, o'chirish", `del:${d.id}`).text("Bekor qilish", "cancel");
  await ctx.reply(`<b>${esc(d.name)}</b> va uning barcha to'lovlari o'chirilsinmi?`, { ...HTML, reply_markup: kb });
}));

// ---------- to'lov kiritish ----------
async function recordPayment(ctx, d, amount, note = "") {
  const { debtor, payment } = await addPayment(d.id, amount, ctx.from.id, note);
  const kb = new InlineKeyboard().text("↩️ Bekor qilish", `undo:${debtor.id}:${payment.id}`);
  await ctx.reply(`✅ <b>${esc(debtor.name)}</b> — ${fmt(amount, debtor.currency)} qabul qilindi\n\n${shortText(debtor)}`, { ...HTML, reply_markup: kb });
  if (String(debtor.tgId) !== String(ctx.from.id)) notifyCustomer(debtor, amount);
}

function notifyCustomer(debtor, amount) {
  if (!debtor.tgId) return;
  const c = calc(debtor);
  bot.api.sendMessage(debtor.tgId,
    `✅ ${fmt(amount, debtor.currency)} to'lovingiz qabul qilindi. Rahmat!\nQolgan qarz: <b>${fmt(c.remaining, debtor.currency)}</b> (${c.paidMonths}/${debtor.months} oy to'langan)` +
    (c.done ? "\n🎉 Qarz to'liq to'landi!" : `\n⏰ Keyingi to'lov: ${fmtDate(c.nextDue)}`), HTML).catch(() => {});
}

// ---------- mijoz tugmalari: "To'lov qilish" va "To'lov qildim" ----------
const ownMine = async (ctx, id) => {
  const d = await getDebtor(id);
  return d && String(d.tgId) === String(ctx.from.id) ? d : null;
};

bot.callbackQuery(/^cards:(\w+)$/, async (ctx) => {
  const d = await ownMine(ctx, ctx.match[1]);
  if (!d) return ctx.answerCallbackQuery({ text: "Bu ma'lumot sizniki emas.", show_alert: true });
  const r = await cardsText(d);
  const kb = !r.done && r.hasCards ? new InlineKeyboard().text("✅ To'lov qildim", `paid:${d.id}`) : undefined;
  await ctx.reply(r.text, { ...HTML, reply_markup: kb });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^paid:(\w+)$/, async (ctx) => {
  const d = await ownMine(ctx, ctx.match[1]);
  if (!d) return ctx.answerCallbackQuery({ text: "Bu ma'lumot sizniki emas.", show_alert: true });
  const c = calc(d);
  if (c.done) return ctx.answerCallbackQuery({ text: "Qarzingiz to'liq to'langan 🎉", show_alert: true });
  const owner = await getOwner();
  if (owner) {
    const cid = await createClaim(d.id, c.dueNow);
    const kb = new InlineKeyboard().text(`✅ ${fmt(c.dueNow, d.currency)} qabul qilish`, `acc:${cid}`).row().webApp("📊 Panelda boshqa summa", WEBAPP_URL);
    await bot.api.sendMessage(owner,
      `💳 <b>${esc(d.name)}</b> "to'lov qildim" deb bildirdi.\nKutilgan summa: <b>${fmt(c.dueNow, d.currency)}</b> (to'lov sanasi ${fmtDate(c.nextDue)})\n\nKartangizni tekshiring. Pul tushgan bo'lsa, pastdagi tugmani bosing.`,
      { ...HTML, reply_markup: kb }).catch(() => {});
  }
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await ctx.reply("Rahmat! Sotuvchiga xabar berildi ✅. Pul tushgani tasdiqlangach, sizga xabar keladi.");
  await ctx.answerCallbackQuery();
});

bot.on("callback_query:data", async (ctx) => {
  if (!(await isAuthorized(ctx.from.id))) return ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
  const [act, a, b] = ctx.callbackQuery.data.split(":");
  try {
    if (act === "acc") {
      const cl = await takeClaim(a);
      if (!cl) return ctx.answerCallbackQuery({ text: "Bu to'lov allaqachon qabul qilingan yoki muddati o'tgan.", show_alert: true });
      const { debtor, payment } = await addPayment(cl.id, cl.amount, ctx.from.id, "Mijoz kartaga o'tkazdi");
      await ctx.editMessageText(`✅ <b>${esc(debtor.name)}</b> — ${fmt(payment.amount, debtor.currency)} qabul qilindi\n\n${shortText(debtor)}`,
        { ...HTML, reply_markup: new InlineKeyboard().text("↩️ Bekor qilish", `undo:${debtor.id}:${payment.id}`) });
      notifyCustomer(debtor, payment.amount);
      return ctx.answerCallbackQuery();
    }
    if (act === "undo") {
      const d = await undoPayment(a, b);
      await ctx.editMessageText(`↩️ To'lov bekor qilindi.\n\n${shortText(d)}`, HTML);
    } else if (act === "del") {
      await deleteDebtor(a);
      await ctx.editMessageText("🗑 O'chirildi.");
    } else if (act === "cancel") await ctx.editMessageText("Bekor qilindi.");
    await ctx.answerCallbackQuery();
  } catch (e) {
    await ctx.answerCallbackQuery({ text: errText(e), show_alert: true });
  }
});

// ---------- erkin matn ----------
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/") || !ctx.from) return;
  const reply = { reply_parameters: { message_id: ctx.message.message_id } };

  // Mijoz yozsa: izoh/uzr sifatida saqlanadi va egasiga yetkaziladi
  if (!(await isAuthorized(ctx.from.id))) {
    if (!isPrivate(ctx)) return;
    const mine = (await listDebtors()).filter((d) => String(d.tgId) === String(ctx.from.id));
    if (!mine.length) return;
    const d = mine[0];
    await addExcuse(d.id, text);
    const owner = await getOwner();
    if (owner) bot.api.sendMessage(owner, `💬 <b>${esc(d.name)}</b> yozdi:\n\n${esc(text)}`, HTML).catch(() => {});
    return ctx.reply("Xabaringiz egasiga yuborildi ✅");
  }

  // Egasi/vakil: "[Ism]dan 200 dollar oldim"
  const p = findPayment(text, await listDebtors());
  if (!p) return;
  try {
    if (!p.found.length) {
      if (p.looksLikePayment) await ctx.reply("Bunday ismli mijoz topilmadi. /royxat ni ko'ring.", reply);
      return;
    }
    if (p.found.length > 1)
      return ctx.reply(`Qaysi biri? ${p.found.map((d) => d.name).join(", ")} — to'liq ismini yozing.`, reply);
    const d = p.found[0];
    if (p.currency && p.currency !== d.currency)
      return ctx.reply(`${d.name} qarzi ${d.currency} da, xabardagi valyuta boshqacha ko'rinadi. Tekshirib ko'ring.`, reply);
    await recordPayment(ctx, d, p.amount, text);
  } catch (e) {
    await ctx.reply(errText(e));
    if (!(e instanceof UserError)) console.error(e);
  }
});

bot.catch((e) => console.error("Bot xatosi:", e.error));

export default webhookCallback(bot, "https", { secretToken: WEBHOOK_SECRET });
