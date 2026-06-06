const wa = require('./whatsapp');
const sessions = require('./sessions');

// --- Menu definitions ---

const MAIN_MENU_BUTTONS = [
  { id: 'menu_hours', title: 'Hours' },
  { id: 'menu_services', title: 'Services' },
  { id: 'menu_agent', title: 'Talk to agent' },
];

const SERVICES_LIST = [
  {
    title: 'Our services',
    rows: [
      { id: 'svc_pricing', title: 'Pricing', description: 'See our plans and prices' },
      { id: 'svc_support', title: 'Technical support', description: 'Get help with an issue' },
      { id: 'svc_sales', title: 'Sales inquiry', description: 'Talk to a sales rep' },
      { id: 'svc_back', title: 'Back to main menu' },
    ],
  },
];

const REPLIES = {
  menu_hours:
    'We are open Mon–Fri 9:00–18:00 and Saturday 9:00–13:00. Closed on Sundays and holidays.',
  svc_pricing:
    'Plans:\n• Basic — $19/mo\n• Pro — $49/mo\n• Enterprise — contact sales\n\nReply *menu* to go back.',
  svc_support:
    'For technical support, please describe your issue in one message and our team will reply shortly.',
  svc_sales:
    'A sales representative will get in touch within one business day. Reply *menu* to go back.',
  agent:
    'Got it — I am transferring you to a human agent. Please describe your request and someone will reply soon.',
};

// --- Helpers ---

function normalize(text) {
  return (text || '').trim().toLowerCase();
}

function isGreeting(text) {
  const t = normalize(text);
  return ['hi', 'hello', 'hey', 'oi', 'olá', 'ola', 'start', 'menu', '/start'].includes(t);
}

async function showMainMenu(to, name) {
  const greeting = name ? `Hi ${name}! 👋` : 'Hi there! 👋';
  await wa.sendButtons(
    to,
    `${greeting}\n\nHow can I help you today? Choose an option below or type *menu* anytime.`,
    MAIN_MENU_BUTTONS,
    { header: 'Welcome', footer: 'Powered by WhatsApp Cloud API' }
  );
  sessions.update(to, { state: 'main_menu' });
}

async function showServices(to) {
  await wa.sendList(
    to,
    'Pick one of our services:',
    'View services',
    SERVICES_LIST,
    { header: 'Services' }
  );
  sessions.update(to, { state: 'services' });
}

// --- Main dispatcher ---

async function handle(message, contact) {
  const from = message.from;
  const name = contact?.profile?.name;

  // Mark read + show typing
  try {
    await wa.markRead(message.id, { typing: true });
  } catch { }

  const session = sessions.get(from);

  // Extract user input from text or interactive reply
  let userText = null;
  let actionId = null;

  if (message.type === 'text') {
    userText = message.text?.body || '';
  } else if (message.type === 'interactive') {
    const i = message.interactive || {};
    if (i.type === 'button_reply') {
      actionId = i.button_reply.id;
      userText = i.button_reply.title;
    } else if (i.type === 'list_reply') {
      actionId = i.list_reply.id;
      userText = i.list_reply.title;
    }
  } else {
    await wa.sendText(
      from,
      "Sorry, I can only handle text and menu replies right now. Type *menu* to see options."
    );
    return;
  }

  sessions.pushHistory(from, 'user', userText || actionId || `[${message.type}]`);

  // Welcome flow: first contact or greeting -> show main menu
  if (session.state === 'new' || isGreeting(userText)) {
    await showMainMenu(from, name);
    sessions.pushHistory(from, 'bot', '[main menu]');
    return;
  }

  // Handle interactive replies
  if (actionId) {
    if (actionId === 'menu_hours') {
      await wa.sendText(from, REPLIES.menu_hours);
      sessions.pushHistory(from, 'bot', REPLIES.menu_hours);
      return;
    }
    if (actionId === 'menu_services') {
      await showServices(from);
      sessions.pushHistory(from, 'bot', '[services list]');
      return;
    }
    if (actionId === 'menu_agent') {
      await wa.sendText(from, REPLIES.agent);
      sessions.update(from, { state: 'with_agent' });
      sessions.pushHistory(from, 'bot', REPLIES.agent);
      return;
    }
    if (actionId === 'svc_back') {
      await showMainMenu(from, name);
      return;
    }
    if (REPLIES[actionId]) {
      await wa.sendText(from, REPLIES[actionId]);
      sessions.pushHistory(from, 'bot', REPLIES[actionId]);
      return;
    }
  }

  // Numeric shortcuts from main menu
  const t = normalize(userText);
  if (session.state === 'main_menu') {
    if (t === '1') return handleActionId(from, name, 'menu_hours');
    if (t === '2') return handleActionId(from, name, 'menu_services');
    if (t === '3') return handleActionId(from, name, 'menu_agent');
  }

  // Agent handoff: just acknowledge, don't auto-reply with menu
  if (session.state === 'with_agent') {
    await wa.sendText(
      from,
      'Thanks — your message was forwarded to our team. Reply *menu* to return to the bot.'
    );
    return;
  }

  // Fallback
  await wa.sendText(
    from,
    "I didn't understand that. Type *menu* to see the available options."
  );
}

async function handleActionId(from, name, id) {
  return handle({ from, id: 'synthetic', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: id } } }, { profile: { name } });
}

module.exports = { handle };
