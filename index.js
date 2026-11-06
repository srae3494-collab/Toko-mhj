// Bot WhatsApp Auto-reply / FAQ
// Jalankan: npm install && npm start, lalu scan QR dari WhatsApp > Perangkat tertaut.

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const FAQ_PATH = path.join(__dirname, 'faq.json');

// ---- Pengaturan ----
const REPLY_IN_GROUPS = false;   // true = bot juga membalas di grup
const COOLDOWN_MS = 3000;        // jeda minimal per pengirim (anti-spam)
const TYPING_DELAY_MS = 1200;    // simulasi mengetik sebelum membalas
// --------------------

let faq = loadFaq();
fs.watchFile(FAQ_PATH, () => {
  try {
    faq = loadFaq();
    console.log('faq.json dimuat ulang');
  } catch (e) {
    console.error('Gagal memuat faq.json:', e.message);
  }
});

function loadFaq() {
  return JSON.parse(fs.readFileSync(FAQ_PATH, 'utf8'));
}

function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function findReply(text) {
  const t = ' ' + normalize(text) + ' ';
  for (const rule of faq.rules) {
    for (const kw of rule.keywords) {
      if (t.includes(' ' + normalize(kw) + ' ')) return rule.reply;
    }
  }
  return faq.default;
}

const client = new Client({
  authStrategy: new LocalAuth(), // sesi tersimpan, tidak perlu scan QR tiap start
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('Scan QR ini lewat WhatsApp > Perangkat tertaut > Tautkan perangkat:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('Terautentikasi'));
client.on('auth_failure', (m) => console.error('Autentikasi gagal:', m));
let botReady = false;
client.on('ready', () => {
  botReady = true;
  console.log('Bot siap dan terhubung ke WhatsApp ✅');
});
client.on('disconnected', (r) => console.log('Terputus:', r));

const lastReply = new Map();

client.on('message', async (msg) => {
  try {
    if (msg.fromMe || msg.isStatus || msg.type !== 'chat') return;

    const chat = await msg.getChat();
    if (chat.isGroup && !REPLY_IN_GROUPS) return;

    const now = Date.now();
    if (now - (lastReply.get(msg.from) || 0) < COOLDOWN_MS) return;
    lastReply.set(msg.from, now);

    const reply = findReply(msg.body);

    await chat.sendStateTyping();
    await new Promise((r) => setTimeout(r, TYPING_DELAY_MS));
    await msg.reply(reply);
    await chat.clearState();

    console.log(`[${msg.from}] ${msg.body}  ->  dibalas`);
  } catch (err) {
    console.error('Error:', err);
  }
});

// ================= API untuk web (Netlify) =================
// Env: API_KEY (wajib), PORT (default 3000)
const express = require('express');
const API_KEY = process.env.API_KEY || '';
const PORT = process.env.PORT || 3000;

if (!API_KEY) {
  console.warn('PERINGATAN: API_KEY belum diset, semua request API akan ditolak.');
}

function toWaNumber(raw) {
  let n = String(raw || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (n.startsWith('8')) n = '62' + n;
  return n;
}

const app = express();
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  if (!API_KEY || req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
});

app.get('/status', (req, res) => res.json({ ok: true, ready: botReady }));

const SEND_GAP_MS = 2500;
let lastSend = 0;

app.post('/kirim', async (req, res) => {
  try {
    if (!botReady) return res.status(503).json({ ok: false, error: 'bot belum siap' });
    const nomor = toWaNumber(req.body.nomor);
    const pesan = String(req.body.pesan || '').slice(0, 4000);
    if (nomor.length < 10 || !pesan) {
      return res.status(400).json({ ok: false, error: 'nomor/pesan tidak valid' });
    }
    // antrean kirim: jeda antar pesan supaya tidak terlihat seperti spam
    const tunggu = Math.max(0, lastSend + SEND_GAP_MS - Date.now());
    lastSend = Date.now() + tunggu;
    if (tunggu) await new Promise((r) => setTimeout(r, tunggu));
    const id = await client.getNumberId(nomor);
    if (!id) return res.status(404).json({ ok: false, error: 'nomor tidak terdaftar di WhatsApp' });
    await client.sendMessage(id._serialized, pesan);
    res.json({ ok: true });
  } catch (err) {
    console.error('Gagal kirim:', err);
    res.status(500).json({ ok: false, error: 'gagal kirim' });
  }
});

app.listen(PORT, () => console.log(`API bot aktif di port ${PORT}`));
// ===========================================================

client.initialize();
