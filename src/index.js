require('dotenv').config();
const express = require('express');
const webhook = require('./webhook');
const wa = require('./whatsapp');
const storage = require('./storage');

const app = express();

// Capture raw body for signature verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Meta webhook (register this URL in the Meta App dashboard)
app.use('/webhook', webhook);

// --- Send endpoints ---

app.post('/send/text', async (req, res) => {
  try {
    const { to, body, preview_url } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'to and body are required' });
    const result = await wa.sendText(to, body, !!preview_url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post('/send/template', async (req, res) => {
  try {
    const { to, template, language, components } = req.body;
    if (!to || !template) return res.status(400).json({ error: 'to and template are required' });
    const result = await wa.sendTemplate(to, template, language, components);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post('/send/media', async (req, res) => {
  try {
    const { to, type, id, link, caption, filename } = req.body;
    if (!to || !type) return res.status(400).json({ error: 'to and type are required' });
    const result = await wa.sendMedia(to, type, { id, link, caption, filename });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// --- Inbox: stored incoming messages/statuses ---
app.get('/messages', (_req, res) => {
  res.json(storage.readAll());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WhatsApp app listening on :${PORT}`);
  console.log(`Webhook URL path: /webhook`);
});
