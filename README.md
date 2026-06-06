# WhatsApp Cloud API Chatbot

A Node.js + Express app that connects to the WhatsApp Business Cloud API. It exposes a Meta webhook, a menu-based chatbot with interactive buttons/lists and per-user session state, and HTTP endpoints to send text, template, and media messages.

## Features

- Meta webhook (GET verify handshake + POST event handler) with `x-hub-signature-256` validation
- Menu-based chatbot (welcome message, buttons, list, agent handoff)
- Per-user conversation state with last-N history, persisted to `data/sessions.json`
- Read receipts + typing indicator on each incoming message
- HTTP endpoints to send text, template, and media
- Incoming messages and statuses stored to `data/messages.jsonl`
- Dockerfile included

## Requirements

- Node.js 20+
- A Meta developer account with a WhatsApp Business app
- A test phone number (the Cloud API gives you one for free in the dashboard)

## 1. Get Meta credentials

1. Go to <https://developers.facebook.com/apps> and create (or open) a **Business** type app.
2. Add the **WhatsApp** product to the app.
3. Open **WhatsApp → API Setup**. From this page copy:
   - **Phone number ID** → `PHONE_NUMBER_ID`
   - **Temporary access token** → `WHATSAPP_TOKEN` (valid 24h; create a System User token for production)
   - The **test recipient** phone number you add here is the only number that can receive messages until your app is approved.
4. Open **App Settings → Basic** and copy **App Secret** → `APP_SECRET` (used to verify webhook signatures).
5. Choose your own random string for `VERIFY_TOKEN` (any long string — must match what you set in Meta when subscribing the webhook).

## 2. Configure environment

Create a `.env` file in the project root (`test-1/`):

```env
WHATSAPP_TOKEN=your_access_token
PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_API_VERSION=v21.0

VERIFY_TOKEN=choose_a_long_random_string
APP_SECRET=your_meta_app_secret

PORT=3000
```

## 3. Install and run

```bash
npm install
npm start          # production
npm run dev        # watches for changes
```

The server listens on `http://localhost:3000` and the webhook path is `/webhook`.

## 4. Expose the webhook publicly

Meta needs to reach your webhook over HTTPS. For local development use [ngrok](https://ngrok.com/) (or Cloudflare Tunnel):

```bash
ngrok http 3000
```

Copy the `https://<random>.ngrok-free.app` URL — your full webhook URL is `https://<random>.ngrok-free.app/webhook`.

## 5. Register the webhook in Meta

1. In the Meta App dashboard go to **WhatsApp → Configuration → Webhook**.
2. Click **Edit** and set:
   - **Callback URL**: `https://<your-public-host>/webhook`
   - **Verify token**: the same value you put in `VERIFY_TOKEN`
3. Click **Verify and save**. Meta will call `GET /webhook` and your app will echo the challenge.
4. Under **Webhook fields**, click **Manage** and subscribe to at least:
   - `messages` (required for the chatbot)
   - Optionally: `message_template_status_update`

## 6. Try the bot

From the **API Setup** page, send yourself the pre-approved `hello_world` template to open the 24h customer service window. Then send any text from the WhatsApp app on your phone to the test number — the bot will reply with the welcome menu.

Conversation flow:

- Any first message (or `hi`, `hello`, `menu`) → main menu with three buttons (Hours / Services / Talk to agent).
- **Hours** → returns business hours.
- **Services** → opens an interactive list (Pricing / Support / Sales / Back).
- **Talk to agent** → switches the session to `with_agent` state; further messages are acknowledged without auto-replying. Send `menu` to return to the bot.
- Numeric shortcuts `1`, `2`, `3` work from the main menu.

To customize replies and menus, edit the constants at the top of `src/bot.js`.

## HTTP endpoints

| Method | Path             | Body                                                              | Description                          |
| ------ | ---------------- | ----------------------------------------------------------------- | ------------------------------------ |
| GET    | `/health`        | —                                                                 | Health check                         |
| GET    | `/webhook`       | (Meta handshake)                                                  | Webhook verification                 |
| POST   | `/webhook`       | (Meta event)                                                      | Receives messages and statuses       |
| POST   | `/send/text`     | `{ "to": "55119...", "body": "hi", "preview_url": false }`        | Send a free-form text                |
| POST   | `/send/template` | `{ "to": "...", "template": "hello_world", "language": "en_US" }` | Send a pre-approved template         |
| POST   | `/send/media`    | `{ "to": "...", "type": "image", "link": "https://...", "caption": "..." }` | Send image/document/audio/video/sticker |
| GET    | `/messages`      | —                                                                 | Read stored incoming messages        |

Example:

```bash
curl -X POST http://localhost:3000/send/text \
  -H 'content-type: application/json' \
  -d '{"to":"5511999999999","body":"hello from the API"}'
```

> Free-form text only works inside the 24h customer service window (i.e. after the user messaged the bot). Outside that window, you must use `/send/template` with a template approved in **WhatsApp → Message Templates**.

## Docker

```bash
docker build -t whatsapp-bot .
docker run --rm -p 3000:3000 --env-file .env -v "$(pwd)/data:/app/data" whatsapp-bot
```

## Project layout

```
src/
  index.js      Express app, send endpoints, /messages inbox
  webhook.js    Meta webhook (verify + event handler, signature check)
  whatsapp.js   Cloud API client (text, template, media, buttons, list, typing)
  bot.js        Menu-based chatbot dispatcher
  sessions.js   Per-user session state, persisted to data/sessions.json
  storage.js    Incoming events stored as JSONL in data/messages.jsonl
data/           Created at runtime (gitignored)
Dockerfile
.env            Your secrets (gitignored)
```

## Troubleshooting

- **Webhook verification fails** — `VERIFY_TOKEN` in `.env` must match the value entered in Meta's dashboard exactly.
- **`401` on incoming events** — `APP_SECRET` is wrong or missing. Remove it from `.env` to disable signature checking while debugging.
- **`recipient phone number not in allowed list`** — add the recipient in **WhatsApp → API Setup → To** until the app is fully approved.
- **`message failed to send: re-engagement message`** — the 24h window expired; send a template instead.
- **Bot doesn't reply** — make sure you subscribed to the `messages` webhook field in the dashboard and that ngrok is still running with the URL you registered.
