// api/cek-quota.js
// MODE: SIDOMPUL OFFICIAL (ANTI-403 & DEBUGGER)

export default async function handler(req, res) {
  // 1. SETUP CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 2. AMBIL TOKEN & BERSIHKAN
  let ACCESS_TOKEN = process.env.XL_SIDOMPUL_TOKEN || "";
  // Hapus spasi/enter yang tidak sengaja ikut ter-copy
  ACCESS_TOKEN = ACCESS_TOKEN.trim();

  if (!ACCESS_TOKEN) {
      return res.status(500).json({ success: false, message: 'Token Kosong di Vercel' });
  }

  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Nomor wajib diisi' });

  // Format Nomor
  let formattedNum = number.replace(/\D/g, '');
  if (formattedNum.startsWith('0')) formattedNum = '62' + formattedNum.substring(1);
  else if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

  try {
    // 3. LOG TOKEN (Untuk Cek di Vercel Logs)
    // Kita log 5 huruf awal & akhir token untuk memastikan tokennya benar
    const tokenPreview = `${ACCESS_TOKEN.substring(0, 5)}...${ACCESS_TOKEN.substring(ACCESS_TOKEN.length - 5)}`;
    console.log(`[REQ] Nomor: ${formattedNum} | Token: ${tokenPreview}`);

    // 4. REQUEST KE XL (HEADERS DIPERBAIKI)
    const response = await fetch(`https://srg-txl-utility-service.ext.dp.xl.co.id/v2/package/check/${formattedNum}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'language': 'en',
            'version': '4.1.2', 
            'accept': 'application/json',
            'user-agent': 'okhttp/3.12.1',
            // Header x-dynatrace dihapus dulu karena kadang bikin 403 jika token beda sesi
        }
    });

    // Cek Status
    if (response.status === 403) {
        throw new Error(`Akses Ditolak (403). Token mungkin kadaluarsa atau salah. Coba ambil token baru.`);
    }
    if (response.status === 401) {
        throw new Error(`Token Salah/Expired (401). Silakan update token di Vercel.`);
    }

    const json = await response.json();

    // 5. PARSING DATA (SUPER DETECTIVE)
    let finalPackages = [];
    let rawData = [];
    let cardExp = "-";

    // Cari data di berbagai posisi
    if (json.result && json.result.data) rawData = json.result.data;
    else if (json.data) rawData = json.data;
    
    // Pastikan array
    if (!Array.isArray(rawData)) rawData = (rawData ? [rawData] : []);

    // Ambil masa aktif dari item pertama (jika ada)
    if (rawData.length > 0 && rawData[0].expDate) cardExp = rawData[0].expDate;

    rawData.forEach(pkg => {
        // Cek Benefits (Format Baru)
        if (pkg.benefits && Array.isArray(pkg.benefits) && pkg.benefits.length > 0) {
            pkg.benefits.forEach(b => {
                finalPackages.push({
                    name: `${pkg.name} - ${b.bname || b.name || 'Kuota'}`,
                    total: b.quota,
                    remaining: b.remaining,
                    exp_date: pkg.expDate,
                    type: "DATA"
                });
            });
        } 
        // Cek Detail (Format Lama)
        else if (pkg.detail && Array.isArray(pkg.detail) && pkg.detail.length > 0) {
             pkg.detail.forEach(d => {
                finalPackages.push({
                    name: `${pkg.name} - ${d.name || 'Kuota'}`,
                    total: d.quota || d.total,
                    remaining: d.remaining,
                    exp_date: pkg.expDate,
                    type: "DATA"
                });
            });
        }
        // Paket Simple
        else {
             finalPackages.push({
                name: pkg.name || "Unknown",
                total: pkg.quota || pkg.total || "-",
                remaining: pkg.remaining || "-",
                exp_date: pkg.expDate || "-",
                type: "DATA"
            });
        }
    });

    // --- DEBUGGER: JIKA HASIL KOSONG ---
    // Jika tidak nemu paket, kita kirim data mentahnya agar bisa dibaca di frontend
    if (finalPackages.length === 0 && rawData.length > 0) {
        finalPackages.push({
            name: "⚠️ DEBUG DATA (Screenshot Ini)",
            total: "RAW",
            remaining: JSON.stringify(rawData).substring(0, 100), // Potong biar ga kepanjangan
            exp_date: "DEBUG",
            type: "INFO"
        });
    }

    return res.status(200).json({
        success: true,
        source: 'SIDOMPUL_FIX',
        data: {
            subs_info: {
                msisdn: formattedNum,
                exp_date: cardExp,
                card_type: "XL/AXIS",
                net_type: "4G"
            },
            packages: finalPackages
        }
    });

  } catch (error) {
    console.error("[API ERROR]", error);
    // Kirim JSON Error (Jangan HTML)
    return res.status(500).json({ 
        success: false, 
        message: error.message || 'Server Error',
        debug_token: ACCESS_TOKEN ? "Token Ada" : "Token Kosong"
    });
  }
}
