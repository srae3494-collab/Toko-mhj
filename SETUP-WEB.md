# Menghubungkan bot WA ke tb-mungkurhabangjaya.netlify.app

Alur: Web nota (Netlify) → Netlify Function `wa-kirim` → Bot WA (HP/PC/VPS) → WhatsApp

Netlify tidak bisa menjalankan bot (butuh koneksi terus-menerus), jadi bot jalan terpisah.

## 1. Jalankan bot
```
npm install
API_KEY=isi-kunci-rahasia-panjang npm start
```
(Windows PowerShell: `$env:API_KEY="isi-kunci-rahasia-panjang"; npm start`)
Scan QR sekali. Bot membuka API di port 3000.

## 2. Buat bot bisa diakses dari internet (HTTPS)
Situs Netlify memakai HTTPS, jadi bot juga harus HTTPS. Cara termudah tanpa VPS:
Cloudflare Tunnel → `cloudflared tunnel --url http://localhost:3000`
Kamu dapat URL `https://xxxx.trycloudflare.com` (berubah tiap restart; untuk tetap, pakai tunnel bernama + domain sendiri, atau VPS).

## 3. Pasang di Netlify
1. Salin `wa-kirim.js` ke `netlify/functions/wa-kirim.js` di project situs.
2. Di Netlify → Environment variables, isi:
   - `WA_BOT_URL` = URL dari langkah 2
   - `WA_API_KEY` = sama dengan API_KEY bot
   - `WA_OWNER_NUMBER` = nomor WA kamu, format 628xxxxxxxxxx
3. Deploy ulang situs.

## 4. Sambungkan ke halaman nota
Tempel isi `wa-snippet.js` ke halaman nota, lalu panggil `kirimNotaWA(nota)` setelah nota selesai.
Kalau kamu kirim file HTML nota-nya, saya pasangkan langsung ke tombol cetak/simpan.

## Keamanan
- Default-nya notifikasi hanya masuk ke nomor pemilik. Kirim ke pelanggan baru aktif jika `WA_ALLOW_CUSTOMER=true`; hati-hati, karena fungsi Netlify itu bisa dipanggil siapa pun yang tahu URL-nya.
- Jangan taruh `API_KEY` di kode halaman web, hanya di environment variable.
- Library bot tidak resmi: jangan dipakai untuk pesan massal.
