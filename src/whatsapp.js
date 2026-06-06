const axios = require('axios');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;

function client() {
  if (!PHONE_NUMBER_ID || !TOKEN) {
    throw new Error('Missing PHONE_NUMBER_ID or WHATSAPP_TOKEN in environment');
  }
  return axios.create({
    baseURL: `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}

async function sendText(to, body, previewUrl = false) {
  const { data } = await client().post('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: previewUrl, body },
  });
  return data;
}

async function sendTemplate(to, templateName, languageCode = 'en_US', components = []) {
  const { data } = await client().post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
  });
  return data;
}

async function sendMedia(to, type, { id, link, caption, filename }) {
  if (!['image', 'document', 'audio', 'video', 'sticker'].includes(type)) {
    throw new Error(`Unsupported media type: ${type}`);
  }
  const media = {};
  if (id) media.id = id;
  else if (link) media.link = link;
  else throw new Error('Provide either media id or link');
  if (caption && (type === 'image' || type === 'document' || type === 'video')) media.caption = caption;
  if (filename && type === 'document') media.filename = filename;

  const { data } = await client().post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type,
    [type]: media,
  });
  return data;
}

async function markRead(messageId, { typing = false } = {}) {
  const body = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };
  if (typing) body.typing_indicator = { type: 'text' };
  const { data } = await client().post('/messages', body);
  return data;
}

// buttons: [{ id, title }] (max 3, title <= 20 chars)
async function sendButtons(to, bodyText, buttons, { header, footer } = {}) {
  const interactive = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.slice(0, 3).map((b) => ({
        type: 'reply',
        reply: { id: b.id, title: b.title.slice(0, 20) },
      })),
    },
  };
  if (header) interactive.header = { type: 'text', text: header };
  if (footer) interactive.footer = { text: footer };

  const { data } = await client().post('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  });
  return data;
}

// sections: [{ title, rows: [{ id, title, description? }] }]
async function sendList(to, bodyText, buttonText, sections, { header, footer } = {}) {
  const interactive = {
    type: 'list',
    body: { text: bodyText },
    action: { button: buttonText.slice(0, 20), sections },
  };
  if (header) interactive.header = { type: 'text', text: header };
  if (footer) interactive.footer = { text: footer };

  const { data } = await client().post('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  });
  return data;
}

module.exports = { sendText, sendTemplate, sendMedia, markRead, sendButtons, sendList };
