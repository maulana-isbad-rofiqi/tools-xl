export default async function handler(req, res) {
  // 1. SETUP HEADER (Agar tidak CORS di frontend)
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
  if (!number) return res.status(400).json({ error: 'Nomor wajib diisi' });

  // 2. FORMAT NOMOR (Wajib 628xxx)
  let formattedNum = number.replace(/\D/g, '');
  if (formattedNum.startsWith('0')) formattedNum = '62' + formattedNum.substring(1);
  else if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

  // 3. TARGET URL (HANYA KUNCUNG)
  const targetUrl = `https://sidompul.kuncung.qzz.io/?number=${formattedNum}`;

  // 4. DAFTAR JALUR TIKUS (PROXY LIST)
  // Sistem akan mencoba satu per satu sampai berhasil
  const strategies = [
    // STRATEGI 1: Tembak Langsung (Siapa tahu tidak diblokir)
    { 
      url: targetUrl, 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://sidompul.kuncung.qzz.io/'
      } 
    },
    // STRATEGI 2: Lewat Jalur Tikus A (CorsProxy.io)
    { 
      url: `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, 
      headers: {} 
    },
    // STRATEGI 3: Lewat Jalur Tikus B (AllOrigins)
    { 
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, 
      headers: {} 
    },
    // STRATEGI 4: Lewat Jalur Tikus C (ThingProxy)
    { 
      url: `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(targetUrl)}`, 
      headers: {} 
    }
  ];

  // 5. EKSEKUSI (BRUTE FORCE CONNECTION)
  let lastError = null;

  for (const strategy of strategies) {
    try {
      console.log(`Mencoba jalur: ${strategy.url.substring(0, 50)}...`);

      const response = await fetch(strategy.url, {
        headers: strategy.headers,
        method: 'GET' // Pastikan method GET untuk request ke Kuncung
      });

      if (response.ok) {
        const text = await response.text();
        
        // Coba parsing JSON
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          // Jika bukan JSON, berarti error HTML dari Cloudflare/Proxy
          continue; 
        }

        // Cek apakah data Kuncung Valid (Ada success:true atau status:true)
        if (data.status === true || data.success === true || (data.data && data.data.subs_info)) {
          return res.status(200).json(data); // SUKSES! BERHENTI DISINI
        }
      }
    } catch (error) {
      console.error("Jalur gagal, mencoba jalur berikutnya...");
      lastError = error;
      continue;
    }
  }

  // 6. JIKA SEMUA JALUR GAGAL
  return res.status(500).json({ 
    success: false, 
    message: 'Gagal menembus keamanan server Kuncung. Silakan coba lagi nanti.',
    debug: lastError ? lastError.message : 'Unknown error'
  });
}
