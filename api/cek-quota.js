export default async function handler(req, res) {
  // --- 1. SETUP CORS & HEADERS ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- 2. FORMAT NOMOR ---
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Nomor wajib diisi' });

  let formattedNum = number.replace(/\D/g, '');
  if (formattedNum.startsWith('0')) formattedNum = '62' + formattedNum.substring(1);
  else if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

  // --- 3. DAFTAR PROVIDER API (FAILOVER LIST) ---
  // Kita siapkan beberapa sumber. Jika satu mati, pindah ke berikutnya.
  const PROVIDERS = [
    {
      name: 'PRIMARY (Bendith)',
      url: `https://bendith.my.id/end.php?check=package&number=${formattedNum}&version=2`,
      method: 'GET',
      // Parser khusus untuk format Bendith
      parser: (json) => {
        if (!json.data) return null;
        return {
          subs_info: json.data.subs_info || {},
          packages: json.data.packages || json.data.package || []
        };
      }
    },
    {
      name: 'FALLBACK (Nyxs)',
      // API alternatif populer (Gratis)
      url: `https://api.nyxs.pw/tools/xl?no=${formattedNum}`,
      method: 'GET',
      // Parser khusus untuk format Nyxs
      parser: (json) => {
        if (!json.result) return null; // Nyxs pakai 'result' bukan 'data'
        // Kita harus mapping manual agar cocok dengan Frontend
        return {
          subs_info: {
            msisdn: formattedNum,
            exp_date: json.result.masa_aktif || "Unknown", // Sesuaikan field jika beda
            card_type: json.result.tipe_kartu || "XL/AXIS",
            net_type: "LTE"
          },
          packages: json.result.kuota || json.result.packages || [] 
        };
      }
    }
  ];

  // --- 4. ENGINE: REQUEST RUNNER ---
  let lastError = null;

  for (const provider of PROVIDERS) {
    console.log(`[SYSTEM] Trying Provider: ${provider.name}...`);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 detik timeout per provider

      const response = await fetch(provider.url, {
        method: provider.method,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const rawData = await response.json();
      
      // Cek apakah provider ini mengembalikan sukses (biasanya ada flag 'status' atau 'success')
      // Bendith pakai .success, Nyxs pakai .status
      const isSuccess = rawData.success === true || rawData.status === true || rawData.status === 'true';
      
      if (!isSuccess) throw new Error("API merespon tapi status Gagal/False");

      // NORMALIZE DATA
      const cleanData = provider.parser(rawData);
      
      if (!cleanData) throw new Error("Format data tidak dikenali");

      // JIKA BERHASIL, STOP LOOP DAN KIRIM RESPONSE
      console.log(`[SYSTEM] Success with ${provider.name}`);
      
      return res.status(200).json({
        success: true,
        provider: provider.name,
        data: cleanData
      });

    } catch (err) {
      console.error(`[FAIL] ${provider.name} failed: ${err.message}`);
      lastError = err.message;
      // Lanjut ke provider berikutnya di loop...
    }
  }

  // --- 5. FINAL ERROR (Jika semua provider gagal) ---
  return res.status(502).json({
    success: false,
    message: 'Semua Server Pusat Down. Silakan coba lagi nanti.',
    debug_error: lastError
  });
}
