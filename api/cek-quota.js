export default async function handler(req, res) {
  // 1. SETUP HEADERS (CORS)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle Preflight Request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Hanya Method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { number } = req.body;

  if (!number) {
    return res.status(400).json({ error: 'Nomor tidak boleh kosong' });
  }

  // 2. FORMAT NOMOR (Robust Formatting)
  // Menghapus karakter selain angka
  let formattedNum = number.replace(/\D/g, '');
  
  // Normalisasi ke format 628xxx
  if (formattedNum.startsWith('0')) {
    formattedNum = '62' + formattedNum.substring(1);
  } else if (formattedNum.startsWith('8')) {
    formattedNum = '62' + formattedNum;
  }
  // Jika input sudah 628, biarkan.

  try {
    // 3. FETCH DATA DARI API SUMBER
    const apiUrl = `https://bendith.my.id/end.php?check=package&number=${formattedNum}&version=2`;
    
    // Gunakan timeout agar tidak hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 detik timeout

    const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://bendith.my.id/'
        }
    });
    
    clearTimeout(timeoutId);
    
    // Parse JSON
    const result = await response.json();

    // 4. INTELLIGENT ADAPTER LAYER (PENTING!)
    // Kita perbaiki struktur data di sini agar Frontend selalu menerima format yang sama.
    
    if (result && result.data) {
        // Cek apakah data paket tersimpan di nama variabel lain?
        // Prioritas pencarian: packages -> package -> detail -> quotaInfo
        const rawPaket = result.data.packages || result.data.package || result.data.detail || result.data.quotaInfo || [];
        
        // STANDARDISASI: Paksa nama variabel menjadi 'packages' (jamak)
        result.data.packages = Array.isArray(rawPaket) ? rawPaket : [];

        // Hapus duplikasi key jika ada, untuk menghemat bandwidth
        if (result.data.package) delete result.data.package;
    } else {
        // Jika result.data null (gagal dari sumber), kita buat struktur dummy agar frontend tidak error
        if(!result.data) result.data = {};
        result.data.packages = [];
    }

    // Kembalikan data yang sudah dirapikan (Sanitized Data)
    return res.status(200).json(result);
    
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ 
        success: false,
        message: 'Gagal menghubungi server pusat.',
        error: error.message 
    });
  }
}
