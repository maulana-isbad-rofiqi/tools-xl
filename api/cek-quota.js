// api/cek-quota.js
// MODE: SIDOMPUL OFFICIAL API (Direct Access)

export default async function handler(req, res) {
  // 1. SETUP HEADERS (Agar bisa diakses dari web mana saja)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 2. AMBIL TOKEN RAHASIA DARI VERCEL
  const ACCESS_TOKEN = process.env.XL_SIDOMPUL_TOKEN;
  
  if (!ACCESS_TOKEN) {
      return res.status(500).json({ 
          success: false, 
          message: 'Token Sidompul belum dipasang di Settings Vercel (Variable: XL_SIDOMPUL_TOKEN).' 
      });
  }

  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Nomor wajib diisi' });

  // 3. FORMAT NOMOR (Auto 62)
  let formattedNum = number.replace(/\D/g, '');
  if (formattedNum.startsWith('0')) formattedNum = '62' + formattedNum.substring(1);
  else if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

  try {
    console.log(`[SIDOMPUL] Mengecek Nomor: ${formattedNum}`);

    // 4. TEMBAK API RESMI SIDOMPUL
    const targetUrl = `https://srg-txl-utility-service.ext.dp.xl.co.id/v2/package/check/${formattedNum}`;

    const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'language': 'en',
            'version': '4.1.2', 
            'user-agent': 'okhttp/3.12.1', 
            'accept': 'application/json',
            'x-dynatrace': 'MT_3_1_763403741_16-0_a5734da2-0ecb-4c8d-8d21-b008aeec4733_0_396_167'
        }
    });

    const json = await response.json();

    // Cek jika Token Expired (Kode 401)
    if (response.status === 401) {
        throw new Error("Token Sidompul Kadaluarsa. Silakan ambil token baru lagi lewat Termux.");
    }

    if (json.statusCode !== "200" || !json.result || !json.result.data) {
        throw new Error(json.statusDescription || "Gagal mengambil data dari Sidompul (Mungkin nomor salah/hangus).");
    }

    // 5. PARSING DATA (Agar Rapi di Web)
    let finalPackages = [];
    const rawData = json.result.data; 
    
    // Looping Paket Sidompul
    if (Array.isArray(rawData)) {
        rawData.forEach(pkg => {
            const pkgName = pkg.name; 
            const expDate = pkg.expDate;
            
            // Cek detail benefits (Kuota Utama vs Youtube/FB dll)
            if (pkg.benefits && Array.isArray(pkg.benefits)) {
                pkg.benefits.forEach(benefit => {
                    finalPackages.push({
                        name: `${pkgName} - ${benefit.bname || benefit.name || 'DATA'}`, 
                        total: benefit.quota, // Asli dari server (misal "12 GB")
                        remaining: benefit.remaining, // Asli dari server (misal "10.5 GB")
                        exp_date: expDate,
                        type: benefit.type
                    });
                });
            } else {
                // Jika paket simple tanpa detail
                finalPackages.push({
                    name: pkgName,
                    total: "Unknown",
                    remaining: "Active",
                    exp_date: expDate
                });
            }
        });
    }

    // Info Kartu
    let cardExp = "-";
    // Sidompul kadang taruh info masa aktif di paket pertama
    if(rawData.length > 0) cardExp = rawData[0].expDate; 

    return res.status(200).json({
        success: true,
        source: 'OFFICIAL_SIDOMPUL',
        data: {
            subs_info: {
                msisdn: formattedNum,
                exp_date: cardExp,
                card_type: "XL/AXIS (Official)",
                net_type: "4G/LTE"
            },
            packages: finalPackages
        }
    });

  } catch (error) {
    console.error("[SIDOMPUL ERROR]", error);
    return res.status(500).json({ 
        success: false, 
        message: error.message || 'Terjadi kesalahan sistem.',
        error: error.message 
    });
  }
}
