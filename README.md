# Variant to'lov bot

Telegram bot + mini app for installment (rassrochka) receivable tracking: customers, payment schedule, reminders, customer view, Excel export. UI language: Uzbek (Latin).

## Model for selling to others
One deployment = one business. Every buyer runs **their own** copy (own Telegram bot, own Vercel project, own Redis), so each business owns and controls its customers' data. No shared database between buyers.

## Deploy (per buyer, ~15 min)
1. Create a bot with @BotFather → token. In BotFather: `/setprivacy` → Disable (so the bot can read the staff group).
2. Create a Vercel project from this repo; add an Upstash Redis (Vercel Marketplace).
3. Environment variables: `BOT_TOKEN`, `WEBAPP_URL` (the Vercel URL), `WEBHOOK_SECRET` (random), `CRON_SECRET` (random), `BOT_USERNAME`.
4. Set the webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEBAPP_URL>/api/bot&secret_token=<WEBHOOK_SECRET>`
5. Open the bot, send `/start` (first person becomes the owner). Add the bot to the staff group and send `/guruh` there (locks the bot to that group; cannot be moved).

## Security notes
- Telegram `initData` is verified (HMAC) on every API call, max age 24 h; API rate-limited per user.
- Customers only see their own record (never purchase cost/profit). Sensitive bot replies in groups go to private chat; invite links and debt amounts are never posted in groups. Reminders go only to the customer's private chat.
- Invite links are single-use and can be renewed in the panel. The bot leaves any group other than the locked one.
- Keep the GitHub repo **private** and rotate the bot token if it ever leaks (BotFather `/revoke`).

## Legal checklist for the seller (not legal advice)
- `public/privacy.html` and `public/terms.html` are Uzbek templates: add your business name/contact before use and have a local lawyer review them (Uzbekistan personal-data law; KVKK if you operate in Türkiye).
- Customers consent by opening their personal link; `/maxfiylik` shows the policy, `/qarzim` the data, `/meniochir` sends a deletion request.
- Tell customers what you store; do not store more than needed; back up with the Excel export.
