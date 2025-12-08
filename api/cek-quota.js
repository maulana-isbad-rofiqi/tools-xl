// api/cek-quota.js
export default async function handler(req, res) {
  // --- CONFIG HEADER CORS (Agar bisa diakses dari mana saja) ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { number } = req.body;

  if (!number) {
    return res.status(400).json({ error: 'Nomor tidak boleh kosong' });
  }

  // --- FORMAT NOMOR (08xxx -> 628xxx) ---
  let formattedNum = number.replace(/\D/g, '');
  if (formattedNum.startsWith('0')) formattedNum = '62' + formattedNum.substring(1);
  else if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

  // --- DAFTAR SERVER API (Multi-Source) ---
  // Sistem akan mencoba urut dari atas ke bawah
  const apiSources = [
    // Server Utama (Bendith)
    `https://bendith.my.id/end.php?check=package&number=${formattedNum}&version=2`,
    
    // Server Cadangan (Kuncung - Yang baru Anda berikan)
    `https://sidompul.kuncung.qzz.io/?number=${formattedNum}`
  ];

  // --- LOGIKA FETCHING (Looping Server) ---
  for (const apiUrl of apiSources) {
    try {
      console.log(`Mencoba request ke: ${apiUrl}`); // Log untuk debug di Vercel

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      // Jika server merespon (tidak timeout/down)
      if (response.ok) {
        const data = await response.json();

        // Cek apakah data valid (biasanya ada flag 'success': true)
        // Jika API kuncung strukturnya beda, kita anggap sukses asalkan ada datanya
        if (data.success || data.status === true || (data.data && data.data.subs_info)) {
          return res.status(200).json(data); // BERHASIL! Kirim data ke frontend dan stop loop
        }
      }
    } catch (error) {
      console.error(`Gagal koneksi ke ${apiUrl}, mencoba server berikutnya...`);
      // Lanjut ke server berikutnya di list 'apiSources'
      continue;
    }
  }

  // Jika semua server gagal
  return res.status(500).json({ 
    success: false, 
    message: 'Semua server sibuk atau nomor salah. Silakan coba lagi nanti.' 
  });
}
