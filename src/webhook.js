const crypto = require('crypto');
const express = require('express');
const storage = require('./storage');
const bot = require('./bot');

const router = express.Router();

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;

// GET: Meta webhook verification handshake
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function verifySignature(req) {
  if (!APP_SECRET) return true;
  const signature = req.get('x-hub-signature-256');
  if (!signature || !req.rawBody) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// POST: incoming events (messages, statuses)
router.post('/', (req, res) => {
  if (!verifySignature(req)) {
    return res.sendStatus(401);
  }

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  // Respond fast to Meta, then process events asynchronously
  res.sendStatus(200);

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contactsById = {};
      for (const c of value.contacts || []) contactsById[c.wa_id] = c;

      for (const message of value.messages || []) {
        storage.append({
          kind: 'message',
          from: message.from,
          messageId: message.id,
          type: message.type,
          timestamp: message.timestamp,
          payload: message,
        });
        bot.handle(message, contactsById[message.from]).catch((err) => {
          console.error('bot.handle failed:', err.response?.data || err.message);
        });
      }
      for (const status of value.statuses || []) {
        storage.append({
          kind: 'status',
          messageId: status.id,
          status: status.status,
          timestamp: status.timestamp,
          recipient: status.recipient_id,
          payload: status,
        });
      }
    }
  }
});

module.exports = router;
