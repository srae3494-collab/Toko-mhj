/* ===== ServerDB.gs — SERVER DATABASE SINKRON MHJ =====
   Menyimpan semua data aplikasi (akun login, nota/riwayat, piutang, stok, barang,
   pengaturan, penanda notif/chat dll) di Google Sheets agar semua perangkat
   melihat data yang sama dan tersinkron otomatis.

   CARA PASANG (sekali saja, ±3 menit):
   1. Buka https://script.google.com > Proyek baru. Hapus isi Code.gs, tempel SEMUA isi file ini.
   2. Pilih fungsi "siapkan" di menu atas > Run > izinkan akses (Google Sheets) bila diminta.
   3. Deploy > Deployment baru > jenis "Aplikasi Web":
        - Jalankan sebagai: Saya
        - Yang memiliki akses: Siapa saja
      Salin URL yang berakhiran /exec.
   4. Buka index.html, cari  SYNC_URL  lalu tempel URL tadi. Selesai.
   5. Login di HP/PC pertama (akun admin Anda). Data di perangkat itu otomatis naik ke server.
      Perangkat lain tinggal login dengan akun yang sama; datanya otomatis turun & sinkron.

   Catatan: ini proyek Apps Script TERPISAH dari Code.gs pesanan/chat Anda (yang lama tidak diubah). */

var KODE_SETUP  = '';        // opsional: isi kode rahasia agar hanya Anda yang bisa mengaktifkan server (diminta 1x di perangkat pertama)
var SPREADSHEET_ID = '';     // kosongkan = dibuat otomatis bernama "MHJ Database Sinkron"
var HARI_SESI   = 30;        // masa login server per perangkat
var MAKS_LOG    = 30000;     // log dirapikan otomatis bila melebihi jumlah baris ini
var PER_TARIK   = 1500;      // jumlah baris maksimum per sekali tarik
var POTONG      = 45000, JML_POTONG = 4;   // 1 sel Sheets maks 50.000 karakter

var PERAN  = ['admin', 'owner', 'kasir', 'gudang'];
var TULIS  = ['admin', 'owner', 'kasir'];
var PEMILIK = ['admin', 'owner'];
var EMAIL_LAPOR = '';        // email penerima laporan error. Kosong = email akun Google pemilik skrip ini
var MAKS_ERROR  = 500;       // jumlah baris laporan error yang disimpan
var MAKS_KUNJUNGAN = 5000;   // jumlah baris catatan pengunjung yang disimpan
var JEDA_EMAIL  = 600;       // detik: email error paling sering 1x per 10 menit (agar inbox tidak penuh)
/* daftar data yang boleh disimpan: r = peran yang boleh baca, w = peran yang boleh tulis */
var KOLEKSI = {
  tb_riwayat:       { r: PERAN, w: TULIS },
  tb_stok_riwayat:  { r: PERAN, w: TULIS },
  tb_master_barang: { r: PERAN, w: TULIS },
  tb_setting:       { r: PERAN, w: TULIS },
  tb_toko:          { r: PERAN, w: TULIS },
  tb_no_urut:       { r: PERAN, w: TULIS },
  tb_audit:         { r: PERAN, w: TULIS },
  tb_favorit:       { r: PERAN, w: TULIS },
  mh_chat_seen:     { r: TULIS, w: TULIS },
  mh_order_seen:    { r: TULIS, w: TULIS },
  mh_chat_clear:    { r: TULIS, w: TULIS },
  mh_req_status:    { r: TULIS, w: TULIS },
  mh_online_hidden: { r: TULIS, w: TULIS },
  mh_online_order_token_v1: { r: PEMILIK, w: PEMILIK }
};

/* ---------- utilitas ---------- */
var _ss = null;
function props_() { return PropertiesService.getScriptProperties(); }
function ss_() {
  if (_ss) return _ss;
  var id = SPREADSHEET_ID || props_().getProperty('SSID');
  if (id) _ss = SpreadsheetApp.openById(id);
  else { _ss = SpreadsheetApp.create('MHJ Database Sinkron'); props_().setProperty('SSID', _ss.getId()); }
  return _ss;
}
function sheet_(nama, header) {
  var ss = ss_(), sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
    try {
      var all = ss.getSheets();
      if (all.length > 1) all.forEach(function (x) { if (/^(Sheet1|Lembar1|Sheet 1)$/i.test(x.getName())) ss.deleteSheet(x); });
    } catch (e) {}
  }
  return sh;
}
function kunjSheet_() { return sheet_('kunjungan', ['waktu', 'id_perangkat', 'nama', 'peran', 'halaman', 'perangkat', 'layar', 'asal']); }
function errSheet_()  { return sheet_('error', ['waktu', 'pengguna', 'peran', 'pesan', 'lokasi', 'perangkat']); }
function logSheet_()  { return sheet_('log',  ['koleksi', 'id', 'hapus', 'waktu', 'd1', 'd2', 'd3', 'd4']); }
function akunSheet_() { return sheet_('akun', ['id', 'username', 'data']); }
function sesiSheet_() { return sheet_('sesi', ['token', 'uid', 'peran', 'username', 'kedaluwarsa']); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function num_(k, d) { var v = props_().getProperty(k); return v === null ? d : Number(v); }
function tulisTeks_(sh, baris, kolom, data) {
  if (!data.length) return;
  var r = sh.getRange(baris, 1, data.length, kolom);
  r.setNumberFormat('@'); r.setValues(data);
}
function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('');
}
function rahasia_() {
  var s = props_().getProperty('RAHASIA');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props_().setProperty('RAHASIA', s); }
  return s;
}

/* Jalankan SEKALI dari editor untuk memberi izin & membuat spreadsheet */
function siapkan() {
  logSheet_(); akunSheet_(); sesiSheet_(); errSheet_(); kunjSheet_(); rahasia_();
  MailApp.getRemainingDailyQuota(); /* memicu izin kirim email */
  Logger.log('Siap. Database ada di: ' + ss_().getUrl());
}

/* ---------- pintu masuk ---------- */
function doGet() { return json_({ ok: true, layanan: 'MHJ Sync', versi: 1 }); }
function doPost(e) {
  var out;
  try { out = tangani_(JSON.parse((e && e.postData && e.postData.contents) || '{}')); }
  catch (err) { out = { ok: false, error: 'server', pesan: String(err && err.message || err) }; }
  return json_(out);
}
function tangani_(p) {
  switch (p.action) {
    case 'status': return { ok: true, hasUsers: akunSemua_().length > 0, setup: !!KODE_SETUP };
    case 'salt':   return { ok: true, salt: saltUntuk_(String(p.username || '').toLowerCase()) };
    case 'login':  return login_(p);
    case 'init':   return init_(p);
    case 'logout': cabutToken_(p.token); return { ok: true };
    case 'kunjungan': return kunjungan_(p);
    case 'kunjungan_baca':
      var sk = sesi_(p.token);
      if (!sk) return { ok: false, error: 'auth' };
      return kunjunganBaca_(p, sk);
    case 'lapor':
      var sl = sesi_(p.token);
      if (!sl) return { ok: false, error: 'auth' };
      return lapor_(p, sl);
    case 'pull': case 'push':
      var s = sesi_(p.token);
      if (!s) return { ok: false, error: 'auth' };
      return p.action === 'pull' ? tarik_(p, s) : kirim_(p, s);
  }
  return { ok: false, error: 'aksi' };
}

/* ---------- catatan pengunjung ---------- */
/* Dipanggil dari halaman staf & tamu. Tanpa token = "Tamu". Dengan token valid = nama akun staf (dari server, tidak bisa dipalsukan).
   Alamat IP TIDAK tersedia di Apps Script, jadi tamu dikenali lewat id acak per perangkat. */
function kunjungan_(p) {
  var pot = function (x, n) { x = String(x == null ? '' : x).replace(/[\r\n]+/g, ' '); return x.length > n ? x.substr(0, n) : x; };
  var vid = pot(p.vid, 40), hal = pot(p.halaman, 12);
  if (!vid || !/^(staf|tamu|lacak)$/.test(hal)) return { ok: false };
  var c = CacheService.getScriptCache(), mnt = 'kr_' + Math.floor(Date.now() / 60000), n = Number(c.get(mnt) || 0);
  if (n >= 60) return { ok: true, lewat: true };            // batas 60 catatan/menit (cegah banjir)
  c.put(mnt, String(n + 1), 120);
  var kd = 'kv_' + vid + '_' + hal;
  if (c.get(kd)) return { ok: true, ulang: true };           // 1 perangkat + 1 halaman dicatat maks. 1x per 30 menit
  c.put(kd, '1', 1800);
  var s = p.token ? sesi_(p.token) : null;
  var sh = kunjSheet_();
  sh.appendRow([new Date(), vid, s ? s.username : 'Tamu', s ? s.role : 'tamu', hal, pot(p.perangkat, 80), pot(p.layar, 12), pot(p.asal, 60)]);
  var jml = sh.getLastRow() - 1;
  if (jml > MAKS_KUNJUNGAN + 200) sh.deleteRows(2, jml - MAKS_KUNJUNGAN);
  return { ok: true };
}
function kunjunganBaca_(p, s) {
  if (PEMILIK.indexOf(s.role) < 0) return { ok: false, error: 'dilarang' };
  var sh = kunjSheet_(), total = sh.getLastRow() - 1;
  if (total < 1) return { ok: true, ringkas: { hariIni: 0, tujuhHari: 0, unikHariIni: 0, unikTujuh: 0, staf: 0, tamu: 0, total: 0 }, daftar: [] };
  var ambil = Math.min(total, 2000), rows = sh.getRange(total - ambil + 2, 1, ambil, 8).getValues().reverse();
  var tz = 'Asia/Makassar', fmt = function (d, f) { return Utilities.formatDate(new Date(d), tz, f); };
  var hari = fmt(new Date(), 'yyyy-MM-dd'), batas = fmt(new Date(Date.now() - 6 * 86400000), 'yyyy-MM-dd');
  var R = { hariIni: 0, tujuhHari: 0, staf: 0, tamu: 0, total: total }, u1 = {}, u7 = {};
  rows.forEach(function (r) {
    var tgl = fmt(r[0], 'yyyy-MM-dd');
    if (tgl === hari) { R.hariIni++; u1[r[1]] = 1; }
    if (tgl >= batas) { R.tujuhHari++; u7[r[1]] = 1; if (r[3] === 'tamu') R.tamu++; else R.staf++; }
  });
  R.unikHariIni = Object.keys(u1).length; R.unikTujuh = Object.keys(u7).length;
  var daftar = rows.slice(0, 100).map(function (r) { return { t: fmt(r[0], 'dd/MM HH:mm'), id: String(r[1]).slice(0, 6), nama: r[2], peran: r[3], hal: r[4], hp: r[5], layar: r[6], asal: r[7] }; });
  return { ok: true, ringkas: R, daftar: daftar };
}

/* ---------- laporan error dari aplikasi ---------- */
function lapor_(p, s) {
  var pot = function (x, n) { x = String(x == null ? '' : x).replace(/[\r\n]+/g, ' '); return x.length > n ? x.substr(0, n) : x; };
  var r = [new Date(), s.username, s.role, pot(p.pesan, 300), pot(p.lokasi, 120), pot(p.perangkat, 120)];
  var sh = errSheet_();
  sh.appendRow(r);
  var n = sh.getLastRow() - 1;
  if (n > MAKS_ERROR) sh.deleteRows(2, n - MAKS_ERROR);
  var cache = CacheService.getScriptCache();
  var tertahan = Number(cache.get('mail_tertahan') || 0);
  if (cache.get('mail_jeda')) { cache.put('mail_tertahan', String(tertahan + 1), 3600); return { ok: true, email: false }; }
  cache.put('mail_jeda', '1', JEDA_EMAIL);
  cache.remove('mail_tertahan');
  try {
    var tujuan = EMAIL_LAPOR || Session.getEffectiveUser().getEmail();
    MailApp.sendEmail(tujuan, '⚠️ Error aplikasi MHJ Toko',
      'Ada error di aplikasi.\n\nPesan   : ' + r[3] + '\nLokasi  : ' + r[4] + '\nPengguna: ' + r[1] + ' (' + r[2] + ')\nPerangkat: ' + r[5] +
      '\nWaktu   : ' + Utilities.formatDate(r[0], 'Asia/Makassar', 'dd/MM/yyyy HH:mm') + ' WITA' +
      (tertahan ? '\n\n(' + tertahan + ' error lain tertahan sejak email sebelumnya)' : '') +
      '\n\nDaftar lengkap ada di sheet "error": ' + ss_().getUrl());
    return { ok: true, email: true };
  } catch (e) { return { ok: true, email: false }; }
}

/* ---------- akun ---------- */
function akunSemua_() {
  var sh = akunSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 3).getValues().map(function (r) { try { return JSON.parse(r[2]); } catch (e) { return null; } }).filter(Boolean);
}
function akunSimpanSemua_(list) {
  var sh = akunSheet_(), n = sh.getLastRow() - 1;
  if (n > 0) sh.getRange(2, 1, n, 3).clearContent();
  tulisTeks_(sh, 2, 3, list.map(function (u) { return [u.id, u.username, JSON.stringify(u)]; }));
  props_().setProperty('UVER', String(num_('UVER', 0) + 1));
}
function usersUntuk_(s) {
  var all = akunSemua_();
  return s.role === 'admin' ? all : all.filter(function (u) { return u.id === s.uid; });
}
function saltUntuk_(uname) {
  var u = akunSemua_().filter(function (x) { return x.username === uname; })[0];
  return u ? u.salt : sha_(rahasia_() + ':' + uname).slice(0, 32);
}
function userSah_(u) {
  return u && typeof u.id === 'string' && u.id && /^[a-z0-9._-]{3,24}$/.test(u.username || '') &&
    PERAN.indexOf(u.role) > -1 && typeof u.salt === 'string' && typeof u.hash === 'string' && u.salt && u.hash;
}

/* ---------- sesi ---------- */
function buatSesi_(u) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), th = sha_(token);
  var exp = Date.now() + HARI_SESI * 864e5, sh = sesiSheet_(), n = sh.getLastRow() - 1;
  var keep = [];
  if (n > 0) keep = sh.getRange(2, 1, n, 5).getValues().filter(function (r) { return Number(r[4]) > Date.now(); });
  keep.push([th, u.id, u.role, u.username, exp]);
  if (n > 0) sh.getRange(2, 1, n, 5).clearContent();
  tulisTeks_(sh, 2, 5, keep);
  CacheService.getScriptCache().put('s:' + th, JSON.stringify({ uid: u.id, role: u.role, username: u.username, exp: exp }), 21600);
  return token;
}
function sesi_(token) {
  if (!token) return null;
  var th = sha_(String(token)), c = CacheService.getScriptCache(), raw = c.get('s:' + th), s = null;
  if (raw) s = JSON.parse(raw);
  else {
    var sh = sesiSheet_(), n = sh.getLastRow() - 1;
    if (n > 0) sh.getRange(2, 1, n, 5).getValues().forEach(function (r) {
      if (String(r[0]) === th) { s = { uid: String(r[1]), role: String(r[2]), username: String(r[3]), exp: Number(r[4]) }; }
    });
    if (s) c.put('s:' + th, JSON.stringify(s), 21600);
  }
  return (s && s.exp > Date.now()) ? s : null;
}
function cabutSesiSaring_(fn) {
  var sh = sesiSheet_(), n = sh.getLastRow() - 1; if (n < 1) return;
  var rows = sh.getRange(2, 1, n, 5).getValues(), c = CacheService.getScriptCache(), keep = [];
  rows.forEach(function (r) { if (fn(r)) c.remove('s:' + r[0]); else keep.push(r); });
  sh.getRange(2, 1, n, 5).clearContent(); tulisTeks_(sh, 2, 5, keep);
}
function cabutToken_(token) { if (token) { var th = sha_(String(token)); cabutSesiSaring_(function (r) { return String(r[0]) === th; }); } }
function cabutSesiUser_(uid) { cabutSesiSaring_(function (r) { return String(r[1]) === String(uid); }); }

function login_(p) {
  var uname = String(p.username || '').toLowerCase(), c = CacheService.getScriptCache(), kk = 'gagal:' + uname;
  var n = Number(c.get(kk) || 0);
  if (n >= 5) return { ok: false, error: 'kunci', pesan: 'Terlalu banyak percobaan. Coba lagi beberapa menit.' };
  var u = akunSemua_().filter(function (x) { return x.username === uname; })[0];
  if (!u || u.hash !== String(p.hash || '')) { c.put(kk, String(n + 1), 600); return { ok: false, error: 'salah' }; }
  if (u.aktif === false) return { ok: false, error: 'nonaktif' };
  c.remove(kk);
  return hasilLogin_(u);
}
function hasilLogin_(u) {
  var s = { uid: u.id, role: u.role };
  return { ok: true, token: buatSesi_(u), users: usersUntuk_(s), uver: num_('UVER', 0), epoch: num_('EPOCH', 1) };
}
function init_(p) {
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    if (akunSemua_().length) return { ok: false, error: 'sudah' };
    if (KODE_SETUP && String(p.kode || '') !== KODE_SETUP) return { ok: false, error: 'kode' };
    var us = (p.users || []).filter(userSah_);
    var a = us.filter(function (u) { return u.username === String(p.username || '').toLowerCase() && u.hash === p.hash && u.role === 'admin' && u.aktif !== false; })[0];
    if (!a) return { ok: false, error: 'salah' };
    akunSimpanSemua_(us);
    return hasilLogin_(a);
  } finally { lock.releaseLock(); }
}

/* tulis akun: admin bebas (dengan pengaman), non-admin hanya ganti sandi sendiri */
function tulisUser_(c, s) {
  var all = akunSemua_(), ada = all.filter(function (u) { return u.id === c.i; })[0];
  var adminAktif = function (list) { return list.filter(function (u) { return u.role === 'admin' && u.aktif !== false; }).length; };
  if (c.d) {
    if (s.role !== 'admin' || c.i === s.uid || !ada) return 'dilarang';
    var sisa = all.filter(function (u) { return u.id !== c.i; });
    if (!adminAktif(sisa)) return 'dilarang';
    akunSimpanSemua_(sisa); cabutSesiUser_(c.i); return 'ok';
  }
  var u; try { u = JSON.parse(c.v); } catch (e) { return 'rusak'; }
  if (!userSah_(u) || u.id !== c.i) return 'rusak';
  if (s.role !== 'admin') {
    if (c.i !== s.uid || !ada) return 'dilarang';
    ada.salt = u.salt; ada.hash = u.hash; akunSimpanSemua_(all); return 'ok';
  }
  if (all.some(function (x) { return x.id !== u.id && x.username === u.username; })) return 'duplikat';
  var baru = all.filter(function (x) { return x.id !== u.id; }); baru.push(u);
  if (!adminAktif(baru)) return 'dilarang';
  var berubah = ada && (ada.role !== u.role || ada.aktif !== u.aktif || ada.hash !== u.hash);
  akunSimpanSemua_(all.map(function (x) { return x.id === u.id ? u : x; }).concat(ada ? [] : [u]));
  if (berubah && u.id !== s.uid) cabutSesiUser_(u.id);
  return 'ok';
}

/* ---------- data (log append-only) ---------- */
function tarik_(p, s) {
  var ep = num_('EPOCH', 1), sh = logSheet_(), akhir = sh.getLastRow() - 1;
  var since = (Number(p.epoch) === ep) ? Math.max(0, Number(p.since) || 0) : 0;
  if (since > akhir) since = 0;
  var out = { ok: true, epoch: ep, rows: [], seq: since, more: false }, uv = num_('UVER', 0);
  if (Number(p.uver) !== uv) { out.uver = uv; out.users = usersUntuk_(s); }
  if (akhir > since) {
    var n = Math.min(PER_TARIK, akhir - since);
    sh.getRange(since + 2, 1, n, 4 + JML_POTONG).getValues().forEach(function (r) {
      var def = KOLEKSI[r[0]]; if (!def || def.r.indexOf(s.role) < 0) return;
      var del = Number(r[2]) === 1;
      out.rows.push({ c: String(r[0]), i: String(r[1]), d: del ? 1 : 0, v: del ? '' : r.slice(4).join('') });
    });
    out.seq = since + n; out.more = out.seq < akhir;
  }
  return out;
}
function kirim_(p, s) {
  var ch = p.changes || [], lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var rows = [], tolak = [], now = Date.now();
    ch.forEach(function (c) {
      c.i = String(c.i);
      if (c.c === 'mh_users') {
        var r = tulisUser_(c, s); if (r !== 'ok') tolak.push([c.c, c.i, r]); return;
      }
      var def = KOLEKSI[c.c];
      if (!def || def.w.indexOf(s.role) < 0) { tolak.push([c.c, c.i, 'dilarang']); return; }
      var v = c.d ? '' : String(c.v == null ? '' : c.v);
      if (v.length > POTONG * JML_POTONG) { tolak.push([c.c, c.i, 'terlalu besar']); return; }
      var baris = [c.c, c.i, c.d ? 1 : 0, now];
      for (var k = 0; k < JML_POTONG; k++) baris.push(v.substr(k * POTONG, POTONG));
      rows.push(baris);
    });
    var sh = logSheet_();
    tulisTeks_(sh, sh.getLastRow() + 1, 4 + JML_POTONG, rows);
    rapikan_();
    return { ok: true, epoch: num_('EPOCH', 1), tolak: tolak };
  } finally { lock.releaseLock(); }
}
/* buang riwayat perubahan lama: hanya versi terbaru tiap data yang disimpan */
function rapikan_() {
  var sh = logSheet_(), n = sh.getLastRow() - 1;
  if (n < MAKS_LOG) return;
  var kolom = 4 + JML_POTONG, rows = sh.getRange(2, 1, n, kolom).getValues(), peta = {}, urut = [];
  rows.forEach(function (r) {
    var k = r[0] + '\u0001' + r[1];
    if (!(k in peta)) urut.push(k);
    peta[k] = r;
  });
  var simpan = urut.map(function (k) { return peta[k]; }).filter(function (r) { return Number(r[2]) !== 1; });
  sh.getRange(2, 1, n, kolom).clearContent();
  tulisTeks_(sh, 2, kolom, simpan);
  props_().setProperty('EPOCH', String(num_('EPOCH', 1) + 1));
}
