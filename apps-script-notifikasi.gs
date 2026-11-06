/* ===== TAMBAHAN APPS SCRIPT: notifikasi antar-perangkat (nota dicetak) =====
   Tempel fungsi di bawah ke project Apps Script yang SAMA dengan pesanan online,
   lalu tambahkan 2 baris di doPost dan doGet milik Anda (lihat bagian "PASANG").
   Setelah itu: Deploy > Kelola deployment > Edit > Versi baru > Deploy.
   Asumsi: variabel ADMIN_TOKEN sudah ada di script Anda (kunci admin yang sama). */

var MH_EVT_KEY = 'MH_EVENTS', MH_EVT_MAX = 20;      // simpan 20 kejadian terakhir (batas 9 KB per properti)

function mhPushEvent_(ev) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var p = PropertiesService.getScriptProperties();
    var arr = JSON.parse(p.getProperty(MH_EVT_KEY) || '[]');
    arr.push({
      id: String(ev.id || '').slice(0, 60), t: Number(ev.t) || Date.now(), st: Date.now(),
      jenis: String(ev.jenis || '').slice(0, 10), judul: String(ev.judul || '').slice(0, 70),
      isi: String(ev.isi || '').slice(0, 110), dev: String(ev.dev || '').slice(0, 24),
      uid: String(ev.uid || '').slice(0, 24), oleh: String(ev.oleh || '').slice(0, 30)
    });
    p.setProperty(MH_EVT_KEY, JSON.stringify(arr.slice(-MH_EVT_MAX)));
  } finally { lock.releaseLock(); }
}

function mhEventsJsonp_(e) {
  var since = Number(e.parameter.since) || 0, out;
  if (e.parameter.token !== ADMIN_TOKEN) out = { ok: false, error: 'Kunci admin salah' };
  else {
    var arr = JSON.parse(PropertiesService.getScriptProperties().getProperty(MH_EVT_KEY) || '[]');
    out = { ok: true, events: arr.filter(function (x) { return x.st > since; }) };
  }
  return ContentService.createTextOutput(e.parameter.callback + '(' + JSON.stringify(out) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/* ===== PASANG =====
   1) Di AWAL doGet(e), tambahkan:
        if (e.parameter.action === 'events') return mhEventsJsonp_(e);
   2) Di doPost(e), setelah JSON body di-parse menjadi `data` dan sebelum cabang lain, tambahkan:
        if (data.action === 'pushEvent') {
          if (data.token !== ADMIN_TOKEN) return ContentService.createTextOutput('{"ok":false}');
          mhPushEvent_(data.event);
          return ContentService.createTextOutput('{"ok":true}');
        }
*/
