/* =====================================================================
   FaqFotoChat.gs  —  TAMBAHAN SERVER (BELUM DIUJI di proyek Anda)
   Untuk: (1) jawaban otomatis bot (faqGet / faqSet)
          (2) foto di chat (chatUpload)

   CARA PASANG
   1. Tempel seluruh berkas ini sebagai file baru di proyek Apps Script
      yang sama dengan ChatTambahan.gs.
   2. Di doGet (tempat 'chatList', 'products', dll. ditangani) tambahkan:
        if (e.parameter.action === 'faqGet') return fcJsonp_(e, faqGet_());
      Bila doGet Anda sudah punya fungsi pembungkus JSONP sendiri,
      pakai itu: cukup kembalikan hasil faqGet_().
   3. Di doPost (tempat 'newOrder', 'updateStatus', dll. ditangani)
      ambil data hasil JSON.parse(e.postData.contents) lalu tambahkan:
        if (data.action === 'faqSet')     return fcOut_(faqSet_(data));
        if (data.action === 'chatUpload') return fcOut_(chatUpload_(data));
   4. Pada fcTokenOk_ di bawah, ganti isinya dengan pemeriksaan
      "Kunci admin" yang sudah Anda pakai di server (bila beda).
   5. Deploy > Kelola deployment > Edit > Versi baru. Izinkan akses Drive
      saat diminta (dipakai untuk menyimpan foto).
   ===================================================================== */

function fcOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fcJsonp_(e, obj) {
  var cb = String((e.parameter && e.parameter.callback) || '').replace(/[^\w$.]/g, '');
  return ContentService.createTextOutput(cb ? cb + '(' + JSON.stringify(obj) + ')' : JSON.stringify(obj))
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
/* GANTI sesuai pemeriksaan kunci admin yang sudah ada. Contoh ini memakai Script Property ADMIN_TOKEN. */
function fcTokenOk_(token) {
  var t = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return !!t && String(token || '') === t;
}

/* ---- Jawaban otomatis ---- */
function faqGet_() {
  var raw = PropertiesService.getScriptProperties().getProperty('FAQ_BOT') || '[]';
  var list; try { list = JSON.parse(raw); } catch (err) { list = []; }
  return { ok: true, faq: list };
}
function faqSet_(d) {
  if (!fcTokenOk_(d.token)) return { ok: false, error: 'kunci admin salah' };
  var list = (Array.isArray(d.faq) ? d.faq : []).slice(0, 40).map(function (e) {
    return { k: String(e.k || '').slice(0, 120), j: String(e.j || '').slice(0, 600) };
  });
  var txt = JSON.stringify(list);
  if (txt.length > 8500) return { ok: false, error: 'terlalu panjang' };
  PropertiesService.getScriptProperties().setProperty('FAQ_BOT', txt);
  return { ok: true };
}

/* ---- Foto chat: simpan ke Drive, kembalikan tautan gambar ---- */
function fcFolder_() {
  var it = DriveApp.getFoldersByName('Foto Chat Toko');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Foto Chat Toko');
}
function chatUpload_(d) {
  if (!d.nomor) return { ok: false, error: 'nomor kosong' };
  if (String(d.mime || '') !== 'image/jpeg') return { ok: false, error: 'format harus JPEG' };
  var bytes;
  try { bytes = Utilities.base64Decode(String(d.data || '')); } catch (err) { return { ok: false, error: 'data rusak' }; }
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) return { ok: false, error: 'foto terlalu besar' };
  var f = fcFolder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', 'chat-' + String(d.nomor).replace(/[^\w-]/g, '') + '-' + Date.now() + '.jpg'));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1200' };
}
