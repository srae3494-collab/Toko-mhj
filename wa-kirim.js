// Netlify Function: netlify/functions/wa-kirim.js
// Env: WA_BOT_URL, WA_API_KEY, WA_OWNER_NUMBER, WA_STAFF_KEY
// Kirim ke pelanggan HANYA jika header x-staff-key cocok dengan WA_STAFF_KEY.
// Tanpa kunci itu, pesan selalu masuk ke nomor pemilik saja.

const MAX_LEN = 3500;
const H = { 'Content-Type': 'application/json' };
const res = (c, o) => ({ statusCode: c, headers: H, body: JSON.stringify(o) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { ok: false, error: 'method' });

  const { WA_BOT_URL, WA_API_KEY, WA_OWNER_NUMBER, WA_STAFF_KEY } = process.env;
  if (!WA_BOT_URL || !WA_API_KEY || !WA_OWNER_NUMBER) return res(500, { ok: false, error: 'env belum diset' });

  let data;
  try { data = JSON.parse(event.body || '{}'); } catch { return res(400, { ok: false, error: 'json' }); }

  const pesan = String(data.pesan || '').slice(0, MAX_LEN);
  if (!pesan) return res(400, { ok: false, error: 'pesan kosong' });

  let tujuan = WA_OWNER_NUMBER;
  if (data.untuk === 'pelanggan') {
    const k = event.headers['x-staff-key'] || event.headers['X-Staff-Key'];
    if (!WA_STAFF_KEY || k !== WA_STAFF_KEY) return res(401, { ok: false, error: 'kunci staf salah' });
    if (!data.nomor) return res(400, { ok: false, error: 'nomor kosong' });
    tujuan = String(data.nomor);
  }

  try {
    const r = await fetch(WA_BOT_URL.replace(/\/$/, '') + '/kirim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
      body: JSON.stringify({ nomor: tujuan, pesan }),
    });
    const out = await r.json().catch(() => ({}));
    return res(r.status, out);
  } catch (e) {
    return res(502, { ok: false, error: 'bot tidak terjangkau' });
  }
};
