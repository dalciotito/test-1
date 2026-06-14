const axios = require('axios');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const RAW_TOKEN =
  process.env.WHATSAPP_TOKEN ||
  process.env.META_ACCESS_TOKEN ||
  process.env.ACCESS_TOKEN;

function normalizeToken(token) {
  if (!token) return '';
  // Handle common copy/paste issues from dashboards and env UIs.
  return token
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^"|"$/g, '');
}

const TOKEN = normalizeToken(RAW_TOKEN);

function enrichAxiosError(err) {
  const metaError = err?.response?.data?.error;
  if (!metaError) return err;
  if (metaError.type === 'OAuthException' && Number(metaError.code) === 190) {
    const wrapped = new Error(
      'Meta OAuth authentication failed (code 190). Check WHATSAPP_TOKEN (or META_ACCESS_TOKEN/ACCESS_TOKEN), ensure it is valid and not expired, and confirm PHONE_NUMBER_ID belongs to the same WhatsApp Business account.'
    );
    wrapped.cause = err;
    wrapped.response = err.response;
    return wrapped;
  }
  return err;
}

async function postMessages(payload) {
  try {
    const { data } = await client().post('/messages', payload);
    return data;
  } catch (err) {
    throw enrichAxiosError(err);
  }
}

async function verifyAuth() {
  if (!PHONE_NUMBER_ID || !TOKEN) {
    throw new Error(
      'Missing PHONE_NUMBER_ID or access token in environment (WHATSAPP_TOKEN, META_ACCESS_TOKEN, ACCESS_TOKEN)'
    );
  }

  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
      {
        params: {
          fields: 'id,display_phone_number,verified_name,code_verification_status',
        },
        headers: {
          Authorization: `Bearer ${TOKEN}`,
        },
      }
    );

    return {
      ok: true,
      apiVersion: API_VERSION,
      phoneNumberId: PHONE_NUMBER_ID,
      account: data,
    };
  } catch (err) {
    throw enrichAxiosError(err);
  }
}

function client() {
  if (!PHONE_NUMBER_ID || !TOKEN) {
    throw new Error(
      'Missing PHONE_NUMBER_ID or access token in environment (WHATSAPP_TOKEN, META_ACCESS_TOKEN, ACCESS_TOKEN)'
    );
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
  return postMessages({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: previewUrl, body },
  });
}

async function sendTemplate(to, templateName, languageCode = 'en_US', components = []) {
  return postMessages({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
  });
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

  return postMessages({
    messaging_product: 'whatsapp',
    to,
    type,
    [type]: media,
  });
}

async function markRead(messageId, { typing = false } = {}) {
  const body = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };
  if (typing) body.typing_indicator = { type: 'text' };
  return postMessages(body);
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

  return postMessages({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  });
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

  return postMessages({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  });
}

module.exports = {
  sendText,
  sendTemplate,
  sendMedia,
  markRead,
  sendButtons,
  sendList,
  verifyAuth,
};
