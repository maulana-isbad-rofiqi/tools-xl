// api/cek-quota.js
// MODE: TRIPLE FAILOVER SYSTEM (Bendith -> Nyxs -> Wizz)

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

  // 2. FORMAT NOMOR
  let formattedNum = number.replace(/\D/g, '');
  if (formattedNum.startsWith('0')) formattedNum = '62' + formattedNum.substring(1);
  else if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

  // =================================================================
  // 🔰 3 LAPIS PERTAHANAN API
  // =================================================================
  const PROVIDERS = [
    {
      name: 'PRIMARY (Bendith)', 
      url: `https://bendith.my.id/end.php?check=package&number=${formattedNum}&version=2`
    },
    {
      name: 'BACKUP 1 (Nyxs)',
      url: `https://api.nyxs.pw/tools/xl?no=${formattedNum}`
    },
    {
      name: 'BACKUP 2 (Wizz)',
      url: `https://api.wizz.my.id/v1/xl/cek?no=${formattedNum}`
    }
  ];

  // 3. EKSEKUSI LOOPING
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

      // Cek Indikator Sukses (Logic gabungan untuk semua jenis API)
      const isSuccess = json.success === true || json.status === true || json.status === 'true';
      
      if (!isSuccess) throw new Error("API merespon tapi status Gagal/False");

      // --- 4. UNIVERSAL PARSER (Mencari paket di segala posisi) ---
      let finalPackages = [];
      let finalInfo = { msisdn: formattedNum, exp_date: "-", net_type: "LTE", card_type: "XL/AXIS" };

      // Root data bisa ada di 'data', 'result', atau root langsung
      const root = json.data || json.result || json;

      if (root) {
          // Cari Array Paket
          // Bendith: root.packages / root.package
          // Nyxs: root.kuota
          // Wizz: root.packages
          const possibleArrays = [root.packages, root.package, root.kuota, root.data, root.list, root.detail];
          
          for (const arr of possibleArrays) {
              if (Array.isArray(arr) && arr.length > 0) {
                  finalPackages = arr;
                  break;
              }
          }

          // Cari Info Kartu
          // Bendith: root.subs_info
          if (root.subs_info) {
              finalInfo.exp_date = root.subs_info.exp_date || "-";
              finalInfo.msisdn = root.subs_info.msisdn || formattedNum;
              finalInfo.net_type = root.subs_info.net_type || "LTE";
          } else {
              // Nyxs/Wizz flat structure
              finalInfo.exp_date = root.masa_aktif || root.exp_date || root.activeUntil || "-";
              finalInfo.net_type = root.network || root.tipe_kartu || "LTE";
          }
      }

      // SUKSES
      console.log(`[SUCCESS] Data didapat dari ${provider.name}`);
      
      return res.status(200).json({
        success: true,
        provider: provider.name,
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

  // Jika semua mati
  return res.status(502).json({
    success: false,
    message: 'Semua Server (Bendith, Nyxs, Wizz) Sedang Sibuk.',
    error: lastError
  });
}
