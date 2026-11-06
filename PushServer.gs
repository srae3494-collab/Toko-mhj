/* PushServer.gs — proyek Apps Script BARU (terpisah dari server pesanan/ServerDB).
   Deploy: Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone. Salin URL /exec ke PUSH_URL di index.html.
   Script properties (Project Settings > Script properties):
     SA_JSON     = seluruh isi file JSON service account Firebase (Project settings > Service accounts > Generate new private key)
     ADMIN_TOKEN = kunci admin yang SAMA dengan yang dipakai di menu Pesanan Online aplikasi */

function doGet() { return out_({ ok: true, service: 'push' }); }

function doPost(e) {
  var d; try { d = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false }); }
  var P = PropertiesService.getScriptProperties(), adm = P.getProperty('ADMIN_TOKEN') || '', isAdmin = !!adm && d.k === adm;

  if (d.a === 'reg') { /* daftar perangkat: staf wajib kunci admin, tamu terikat nomor pesanan */
    if (!d.t || (d.r === 'staff' && !isAdmin)) return out_({ ok: false });
    P.setProperty('t_' + key_(d.t), JSON.stringify({ t: d.t, r: d.r === 'staff' ? 'staff' : 'tamu', n: String(d.n || '').slice(0, 40), u: String(d.u || '').slice(0, 300), ts: Date.now() }));
    return out_({ ok: true });
  }
  if (d.a === 'unreg') { if (d.t) P.deleteProperty('t_' + key_(d.t)); return out_({ ok: true }); }

  if (d.a === 'send') {
    if (d.to !== 'staff' && d.to !== 'tamu') return out_({ ok: false });
    if (d.to === 'tamu' && !isAdmin) return out_({ ok: false }); /* hanya staf boleh kirim ke pelanggan */
    var c = CacheService.getScriptCache(), n = String(d.n || '').slice(0, 40), rk = 'r_' + d.to + '_' + n;
    if (!isAdmin) { if (c.get(rk)) return out_({ ok: false, wait: true }); c.put(rk, '1', 3); } /* batasi spam dari tamu */
    var sa = JSON.parse(P.getProperty('SA_JSON')), at = token_(sa), all = P.getProperties(), sent = 0;
    var data = { t: String(d.t || '').slice(0, 80), b: String(d.b || '').slice(0, 120), g: d.to + '-' + n };
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('t_') !== 0) return;
      var r; try { r = JSON.parse(all[k]); } catch (x) { return P.deleteProperty(k); }
      if (Date.now() - r.ts > 45 * 864e5) return P.deleteProperty(k);
      if (r.r !== d.to || (d.to === 'tamu' && r.n !== n)) return;
      var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
        method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + at }, muteHttpExceptions: true,
        payload: JSON.stringify({ message: { token: r.t, data: { t: data.t, b: data.b, g: data.g, u: r.u }, webpush: { headers: { Urgency: 'high', TTL: '86400' } } } })
      });
      if (res.getResponseCode() === 404) P.deleteProperty(k); /* token sudah tidak berlaku */ else sent++;
    });
    return out_({ ok: true, sent: sent });
  }
  return out_({ ok: false });
}

function key_(t) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, t)).slice(0, 22); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function token_(sa) { /* token OAuth service account (disimpan 50 menit) */
  var c = CacheService.getScriptCache(), t = c.get('at'); if (t) return t;
  var now = Math.floor(Date.now() / 1000), b = function (s) { return Utilities.base64EncodeWebSafe(s).replace(/=+$/, ''); };
  var h = b(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
      p = b(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })),
      sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(h + '.' + p, sa.private_key)).replace(/=+$/, '');
  var r = JSON.parse(UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: h + '.' + p + '.' + sig } }).getContentText());
  c.put('at', r.access_token, 3000); return r.access_token;
}

/* Jalankan sekali dari editor untuk mengecek konfigurasi: harus tercetak "OK" */
function cek() { var sa = JSON.parse(PropertiesService.getScriptProperties().getProperty('SA_JSON')); Logger.log(token_(sa) ? 'OK, project: ' + sa.project_id : 'GAGAL'); }
