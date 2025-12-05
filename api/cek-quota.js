// api/cek-quota.js
// MODE: HARDCODED MULTI-PROVIDER (Anti-Ribet)

export default async function handler(req, res) {
  // 1. SETUP HEADERS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Nomor wajib diisi' });

  // 2. FORMAT NOMOR (Auto 62)
  let formattedNum = number.replace(/\D/g, '');
  if (formattedNum.startsWith('0')) formattedNum = '62' + formattedNum.substring(1);
  else if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

  // =================================================================
  // 🔰 DAFTAR API (LANGSUNG DI SINI)
  // Sistem akan mencoba urut dari atas ke bawah.
  // =================================================================
  const PROVIDERS = [
    {
      name: 'PRIMARY (Nyxs)',
      url: `https://api.nyxs.pw/tools/xl?no=${formattedNum}`
    },
    {
      name: 'BACKUP (Wizz)',
      url: `https://api.wizz.my.id/v1/xl/cek?no=${formattedNum}`
    }
  ];

  // 3. EKSEKUSI (LOOPING PROVIDER)
  let lastError = null;

  for (const provider of PROVIDERS) {
    console.log(`[SYSTEM] Mencoba API: ${provider.name}...`);
    
    try {
      // Timeout 15 detik per provider
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); 

      const response = await fetch(provider.url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      
      const json = await response.json();

      // Cek Indikator Sukses (Setiap API beda-beda flag-nya)
      // Nyxs pakai .status (boolean/string), Wizz pakai .status (boolean)
      const isSuccess = json.status === true || json.status === 'true' || json.success === true;
      
      if (!isSuccess) throw new Error("API merespon tapi status Gagal/False");

      // --- 4. UNIVERSAL PARSER (PENTING) ---
      // Agar format output ke frontend SELALU SAMA, beda API beda struktur JSON.
      
      let finalPackages = [];
      let finalInfo = { msisdn: formattedNum, exp_date: "-", net_type: "LTE", card_type: "XL/AXIS" };

      // Root data bisa ada di 'data', 'result', atau root langsung
      const root = json.data || json.result || json;

      if (root) {
          // Cari Paket (Array)
          // Nyxs -> root.kuota
          // Wizz -> root.packages
          // Umum -> root.list, root.detail
          const possibleArrays = [root.packages, root.kuota, root.data, root.list];
          for (const arr of possibleArrays) {
              if (Array.isArray(arr) && arr.length > 0) {
                  finalPackages = arr;
                  break;
              }
          }

          // Cari Info Kartu
          finalInfo.exp_date = root.masa_aktif || root.exp_date || root.activeUntil || "Unknown";
          finalInfo.net_type = root.network || root.tipe_kartu || "LTE";
          finalInfo.card_type = root.tipe || "XL/AXIS";
      }

      // SUKSES! Kembalikan data ke Frontend
      console.log(`[SUCCESS] Data didapat dari ${provider.name}`);
      
      return res.status(200).json({
        success: true,
        provider: provider.name, // Info debug: kita pake provider mana
        data: {
            subs_info: finalInfo,
            packages: finalPackages
        }
      });

    } catch (err) {
      console.error(`[FAIL] ${provider.name} gagal: ${err.message}`);
      lastError = err.message;
      // LANJUT KE PROVIDER BERIKUTNYA...
    }
  }

  // Jika semua provider gagal
  return res.status(502).json({
    success: false,
    message: 'Semua Server Pusat Sedang Sibuk/Down.',
    error: lastError
  });
}
