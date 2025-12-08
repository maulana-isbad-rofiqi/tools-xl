export default async function handler(req, res) {
  // 1. SETUP HEADERS (Biar Frontend bisa akses)
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

  // 3. TARGET ASLI
  const targetUrl = `https://sidompul.kuncung.qzz.io/?number=${formattedNum}`;

  // 4. STRATEGI TUNNELING (Backend-to-Backend)
  // Kita gunakan proxy pihak ketiga DI DALAM server Vercel untuk menyembunyikan identitas Vercel
  const tunnelStrategies = [
    // Jalur 1: Tembak Langsung dengan Header Palsu (Mimic Browser)
    {
      url: targetUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://sidompul.kuncung.qzz.io/',
        'Accept': 'application/json'
      }
    },
    // Jalur 2: Via CorsProxy (Sangat Stabil)
    { url: `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` },
    // Jalur 3: Via AllOrigins
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}` },
    // Jalur 4: Via ThingProxy
    { url: `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(targetUrl)}` }
  ];

  // 5. EKSEKUSI
  for (const strategy of tunnelStrategies) {
    try {
      console.log(`Trying Tunnel: ${strategy.url}`);
      
      const response = await fetch(strategy.url, {
        headers: strategy.headers || {},
        method: 'GET'
      });

      if (!response.ok) continue;

      const text = await response.text();
      
      // Validasi apakah ini JSON beneran atau Error HTML
      if (text.trim().startsWith('<')) continue; 

      const data = JSON.parse(text);

      // Cek Validitas Data Kuncung (Status harus true atau ada data subs_info)
      if (data.status === true || data.success === true || (data.data && data.data.subs_info)) {
        return res.status(200).json(data); // SUKSES! Kirim ke frontend
      }

    } catch (e) {
      console.log("Tunnel failed, trying next...");
    }
  }

  // JIKA SEMUA GAGAL
  return res.status(500).json({ 
    success: false, 
    message: 'Server Kuncung memblokir semua akses saat ini. Silakan coba 1 jam lagi.' 
  });
}
