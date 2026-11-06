// Tempel di <script> halaman nota kamu (atau file JS-nya).
// Lalu panggil kirimNotaWA(...) tepat setelah nota selesai/tersimpan.
//
// Contoh pemanggilan:
//   kirimNotaWA({
//     pemesan: 'Pak Budi',
//     total: 1250000,
//     bayar: 1000000,
//     items: [{ nama: 'Semen 50kg', qty: 10, satuan: 'sak', subtotal: 650000 }],
//     telp: '08123456789'   // opsional, hanya dipakai jika kirim ke pelanggan diaktifkan
//   });

function rupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

async function kirimNotaWA(nota, kePelanggan = false) {
  const sisa = Math.max(0, (nota.total || 0) - (nota.bayar || 0));
  const baris = (nota.items || [])
    .map((i) => `• ${i.nama} ${i.qty} ${i.satuan || ''} = ${rupiah(i.subtotal)}`)
    .join('\n');

  const pesan =
    `🧾 *Nota Mungkur Habang Jaya*\n` +
    `Pemesan: ${nota.pemesan || '-'}\n\n` +
    `${baris}\n\n` +
    `*Total: ${rupiah(nota.total)}*\n` +
    `Dibayar: ${rupiah(nota.bayar)}\n` +
    (sisa > 0 ? `⚠️ Sisa (piutang): ${rupiah(sisa)}\n` : `✅ Lunas\n`) +
    `\nTerima kasih telah berbelanja!`;

  try {
    const res = await fetch('/.netlify/functions/wa-kirim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        kePelanggan && nota.telp
          ? { untuk: 'pelanggan', nomor: nota.telp, pesan }
          : { pesan }
      ),
    });
    const out = await res.json();
    if (!out.ok) console.warn('WA gagal:', out.error);
    return out.ok;
  } catch (e) {
    console.warn('WA tidak terkirim:', e);
    return false; // jangan ganggu proses cetak nota kalau WA gagal
  }
}
