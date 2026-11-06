# Aturan proyek: MungkurHabangJaya (aplikasi nota/kasir/piutang toko)

Baca file ini dulu sebelum mengubah apa pun.

## Struktur
- `index.html` = aplikasi staf (SATU file: HTML + CSS + JS di dalamnya). Jangan dipecah.
- `tamu.html` = halaman pelanggan (lacak pesanan, Request barang).
- `config.js` = URL server Apps Script, diisi sekali. Jangan hardcode URL di file lain.
- `sw.js`, `manifest.webmanifest` = notifikasi HP. Jangan tambah cache/PWA offline.
- Netlify: hosting + function `wa-kirim`. Token/API key HANYA di Environment Variables Netlify, tidak pernah di HTML/JS.

## Versi file
- Setiap revisi disimpan sebagai `index-N.html` (N naik 1). Jangan timpa versi lama.
- Tulis di komentar atas perubahan apa yang ditambah di versi itu.

## Aturan data (jangan dilanggar)
- Data di localStorage berkunci awalan `tb_` dan `mh_`. Jangan ganti nama kunci lama (data toko bisa hilang).
- Perubahan baru harus kompatibel dengan data lama. Tidak boleh menghapus/mengosongkan data saat update.
- Kunci yang disinkron server terdaftar di `KINDS` (blok SINKRON SERVER). Kunci baru yang perlu sinkron harus ditambah di sana DAN di ServerDB.gs.
- Zona waktu selalu WITA. Mata uang `Rp`, format angka `id-ID`.
- Aksi penting dicatat lewat `window.auditCatat(kategori, aksi, keterangan)`.
- Error JS otomatis dicatat (blok MONITORING ERROR di paling atas `<head>`) dan dikirim ke server (aksi `lapor` di ServerDB.gs, email ke pemilik). Jangan dihapus.
- Pengunjung web dicatat ke sheet `kunjungan` (aksi `kunjungan`, `kunjungan_baca` di ServerDB.gs). Tamu anonim (id acak), jangan simpan IP/nama tamu tanpa izin.
- Cek Sistem (blok CEK SISTEM di akhir body) hanya membaca data, tidak boleh mengubah data.

## Cetak
- Thermal 58mm. Nama barang di nota sedikit besar; judul bank, no. rekening, pesan penutup lebih kecil tapi jelas.
- Font cetak: NotaMono (tertanam). Semua tombol print memakai animasi loading dari Pengaturan.

## Tampilan
- Gaya terinspirasi osanime.com, banyak tema. Warna font harus terbaca di tiap tema (di luar dan di dalam kolom).
- Tombol Masuk/Buat Akun tidak boleh mengganggu bar menu.
- Login permanen (tidak logout sendiri).

## Cara kerja
- Bahasa antarmuka: Indonesia, kalimat singkat untuk kasir.
- Ubah seminimal mungkin. Jangan refactor besar tanpa diminta.
- Sebelum menyerahkan: cek sintaks JS (tidak ada error di console) dan uji alur utama: buat nota, bayar sebagian, cetak, lacak pesanan.
