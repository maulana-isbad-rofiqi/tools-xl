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

  // --- DAFTAR SERVER API ---
  // Bendith sudah dihapus, sekarang pakai Kuncung saja
  const apiSources = [
    `https://sidompul.kuncung.qzz.io/?number=${formattedNum}`
  ];

  // --- LOGIKA FETCHING ---
  for (const apiUrl of apiSources) {
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (response.ok) {
        const data = await response.json();

        // Cek validitas data (API Kuncung)
        if (data.success || data.status === true || (data.data && data.data.subs_info)) {
          return res.status(200).json(data); // SUKSES
        }
      }
    } catch (error) {
      console.error(`Gagal koneksi ke ${apiUrl}`);
      continue;
    }
  }

  // Jika gagal
  return res.status(500).json({ 
    success: false, 
    message: 'Server sedang sibuk atau nomor tidak ditemukan.' 
  });
}
