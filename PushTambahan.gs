/* ===== PushTambahan.gs — push ke HP lewat ntfy dari server Apps Script =====
   Tempel file ini sebagai berkas baru di proyek Apps Script yang sama
   (di samping Code.gs dan ChatTambahan.gs), lalu isi PUSH_TOPIC.
   Topik harus SAMA dengan yang tampil di aplikasi (tab Toko > Push ke HP). */
var PUSH_TOPIC  = 'ISI_DENGAN_TOPIK_DARI_APLIKASI';
var PUSH_SERVER = 'https://ntfy.sh';

function kirimPush_(judul, isi, tags, prioritas) {
  if (!PUSH_TOPIC || PUSH_TOPIC.indexOf('ISI_') === 0) return;
  try {
    UrlFetchApp.fetch(PUSH_SERVER.replace(/\/+$/, '') + '/', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        topic: PUSH_TOPIC,
        title: String(judul).slice(0, 120),
        message: String(isi || '-').slice(0, 600),
        priority: prioritas || 4,
        tags: tags || ['bell']
      }),
      muteHttpExceptions: true
    });
  } catch (e) { /* push gagal tidak boleh menggagalkan penyimpanan pesanan/chat */ }
}

/* Panggil SETELAH pesanan baru berhasil disimpan; "order" = objek pesanan dari tamu */
function pushPesanan_(order) {
  var its = (order.items || []).slice(0, 3).map(function (x) { return (x.qty || x.jumlah || '') + ' ' + (x.nama || ''); }).join(', ');
  kirimPush_('🛒 Pesanan baru · ' + (order.nama || 'Tamu'),
    'Rp ' + Math.round(Number(order.total) || 0).toLocaleString('id-ID') + ' · ' + (order.items || []).length + ' barang\n' + its +
    '\nHP/WA: ' + (order.hp || '-') + '\nNo. ' + order.nomor, ['shopping_cart'], 4);
}

/* Panggil SETELAH pesan chat berhasil disimpan; "p" = parameter permintaan chatSend (from, nama, text, nomor) */
function pushChat_(p) {
  if (String(p.from) !== 'tamu') return;               // balasan staf tidak dipush
  var teks = String(p.text || ''), nama = p.nama || 'Pelanggan';
  if (/^📝 REQUEST BARANG/.test(teks))
    kirimPush_('📝 Request barang · ' + nama, teks.replace(/^📝 REQUEST BARANG:\s*/, ''), ['memo'], 3);
  else
    kirimPush_('💬 Chat · ' + nama, teks + (p.nomor ? '\nNo. ' + p.nomor : ''), ['speech_balloon'], 4);
}

/* Jalankan manual dari editor Apps Script (Run > tesPush) untuk menguji */
function tesPush() { kirimPush_('🔔 Tes dari server MHJ', 'Push dari Apps Script berfungsi ✓', ['white_check_mark'], 3); }
