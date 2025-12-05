// api/cek-quota.js
// MODE: DETECTIVE & DEBUGGER (Cari paket sampai dapat)

export default async function handler(req, res) {
  // 1. HEADERS & SETUP
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 2. CEK TOKEN
  const ACCESS_TOKEN = process.env.XL_SIDOMPUL_TOKEN;
  if (!ACCESS_TOKEN) return res.status(500).json({ success: false, message: 'Token Vercel Kosong' });

  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Nomor wajib' });

  let formattedNum = number.replace(/\D/g, '').replace(/^0/, '62');
  if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

  try {
    // 3. FETCH SIDOMPUL
    const response = await fetch(`https://srg-txl-utility-service.ext.dp.xl.co.id/v2/package/check/${formattedNum}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'language': 'en',
            'version': '4.1.2', 
            'content-type': 'application/json',
            'accept': 'application/json'
        }
    });

    const json = await response.json();

    // 4. LOGIKA PENCARIAN PAKET (REVISI BESAR)
    let finalPackages = [];
    let rawData = [];

    // Cek berbagai kemungkinan posisi data
    if (json.result && json.result.data) rawData = json.result.data;
    else if (json.data) rawData = json.data;
    
    // Pastikan rawData adalah Array
    if (!Array.isArray(rawData)) rawData = [rawData];

    // LOOPING DATA
    rawData.forEach(pkg => {
        // Cek 1: Ada di dalam 'benefits' (Standard Baru)
        if (pkg.benefits && Array.isArray(pkg.benefits) && pkg.benefits.length > 0) {
            pkg.benefits.forEach(b => {
                finalPackages.push({
                    name: `${pkg.name} - ${b.bname || b.name || 'DATA'}`,
                    total: b.quota,
                    remaining: b.remaining,
                    exp_date: pkg.expDate,
                    type: "DATA"
                });
            });
        } 
        // Cek 2: Ada di dalam 'detail' (Standard Lama)
        else if (pkg.detail && Array.isArray(pkg.detail) && pkg.detail.length > 0) {
             pkg.detail.forEach(d => {
                finalPackages.push({
                    name: `${pkg.name} - ${d.name || 'DATA'}`,
                    total: d.quota || d.total,
                    remaining: d.remaining,
                    exp_date: pkg.expDate,
                    type: "DATA"
                });
            });
        }
        // Cek 3: Paket Level Atas (Tanpa sub-detail)
        else {
             finalPackages.push({
                name: pkg.name || "Unknown Package",
                total: pkg.quota || pkg.total || "Unlimited",
                remaining: pkg.remaining || "Active",
                exp_date: pkg.expDate || "-",
                type: "DATA"
            });
        }
    });

    // --- DEBUGGING CARD (JIKA PAKET TETAP KOSONG) ---
    // Jika sistem gagal menemukan paket, kita akan paksa tampilkan data mentah
    // agar kita bisa baca strukturnya lewat screenshot HP Anda.
    if (finalPackages.length === 0 || (finalPackages.length === 1 && !finalPackages[0].name)) {
        console.log("DEBUG RAW:", JSON.stringify(rawData)); // Log ke Vercel
        
        finalPackages.push({
            name: "⚠️ DEBUG MODE (Screenshot Ini)",
            total: "CEK",
            // Kita ambil cuplikan JSON biar tahu nama variabelnya
            remaining: JSON.stringify(rawData).slice(0, 150), 
            exp_date: "DEBUG",
            type: "INFO"
        });
    }

    return res.status(200).json({
        success: true,
        source: 'SIDOMPUL_DEBUG',
        data: {
            subs_info: {
                msisdn: formattedNum,
                exp_date: rawData[0]?.expDate || "-",
                card_type: "XL/AXIS",
                net_type: "4G"
            },
            packages: finalPackages
        }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
