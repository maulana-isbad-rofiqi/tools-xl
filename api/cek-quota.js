// api/cek-quota.js
// MODE: QUADRUPLE FAILOVER (4 Server Pertahanan)

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

  // 3. DAFTAR 4 SERVER JALUR TIKUS
  // Sistem akan mencoba urut dari atas ke bawah.
  const PROVIDERS = [
    {
      name: 'SERVER 1 (Nyxs)',
      url: `https://api.nyxs.pw/tools/xl?no=${formattedNum}`
    },
    {
      name: 'SERVER 2 (Wizz)',
      url: `https://api.wizz.my.id/v1/xl/cek?no=${formattedNum}`
    },
    {
      name: 'SERVER 3 (Star)',
      url: `https://api.star-dev.my.id/api/xl-axis?no=${formattedNum}`
    },
    {
      name: 'SERVER 4 (Bendith)',
      url: `https://bendith.my.id/end.php?check=package&number=${formattedNum}&version=2`
    }
  ];

  // 4. EKSEKUSI (Coba satu per satu)
  let lastError = null;

  for (const provider of PROVIDERS) {
    console.log(`[SYSTEM] Mencoba Jalur: ${provider.name}...`);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 detik timeout

      const response = await fetch(provider.url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const json = await response.json();

      // Cek apakah sukses (Tiap API punya gaya beda-beda)
      // Bendith/Nyxs pake .success atau .status
      const isSuccess = json.success === true || json.status === true || json.status === 'true';
      if (!isSuccess) throw new Error("Status API: Gagal/False");

      // --- 5. UNIVERSAL PARSER (Cerdas Membaca Semua Format) ---
      let finalPackages = [];
      let finalInfo = { 
          msisdn: formattedNum, 
          exp_date: "Unknown", 
          net_type: "4G/LTE",
          card_type: "XL/AXIS"
      };

      // Cari Root Data (Bisa di .data, .result, atau root langsung)
      const root = json.data || json.result || json;

      if (root) {
          // A. CARI PAKET (Mencoba menebak nama variabel array)
          // Bendith -> data.packages / data.package
          // Nyxs -> result.kuota
          // Wizz -> data.packages
          const possibleArrays = [root.packages, root.package, root.kuota, root.data, root.list, root.detail];
          
          for (const arr of possibleArrays) {
              if (Array.isArray(arr) && arr.length > 0) {
                  finalPackages = arr;
                  break;
              }
          }

          // B. CARI INFO KARTU
          // Bendith punya sub-object 'subs_info'
          if (root.subs_info) {
              finalInfo.exp_date = root.subs_info.exp_date || "-";
              finalInfo.msisdn = root.subs_info.msisdn || formattedNum;
              finalInfo.card_type = root.subs_info.card_type || "XL/AXIS";
          } 
          // Nyxs/Wizz biasanya datar
          else {
              finalInfo.exp_date = root.masa_aktif || root.exp_date || root.activeUntil || "-";
              finalInfo.net_type = root.network || root.tipe_kartu || "LTE";
          }
      }

      console.log(`[BERHASIL] Data didapat dari ${provider.name}`);
      
      return res.status(200).json({
        success: true,
        provider: provider.name,
        data: {
            subs_info: finalInfo,
            packages: finalPackages
        }
      });

    } catch (err) {
      console.error(`[GAGAL] ${provider.name}: ${err.message}`);
      lastError = err.message;
      // Otomatis lanjut ke provider berikutnya...
    }
  }

  // Jika SEMUA (4 SERVER) MATI
  return res.status(502).json({
    success: false,
    message: 'Semua Server (Nyxs, Wizz, Star, Bendith) Sedang Sibuk. Coba lagi nanti.',
    debug_error: lastError
  });
}
