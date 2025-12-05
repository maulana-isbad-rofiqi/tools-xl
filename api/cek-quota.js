// api/cek-quota.js
// MODE: SIDOMPUL OFFICIAL (SAFE GUARDED)

export default async function handler(req, res) {
  // --- A. SETUP CORS & ERROR HANDLING ---
  try {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Validasi Method
    if (req.method !== 'POST') {
        throw new Error("Method not allowed (Gunakan POST)");
    }

    // --- B. CEK TOKEN VERCEL ---
    // Pastikan Variable Environment terbaca
    const ACCESS_TOKEN = process.env.XL_SIDOMPUL_TOKEN;
    if (!ACCESS_TOKEN) {
        throw new Error("SERVER CONFIG ERROR: Token Sidompul (XL_SIDOMPUL_TOKEN) belum disetting di Vercel.");
    }

    // --- C. CEK INPUT ---
    const { number } = req.body || {};
    if (!number) {
        throw new Error("Nomor HP wajib diisi");
    }

    // Format Nomor
    let formattedNum = number.replace(/\D/g, '');
    if (formattedNum.startsWith('0')) formattedNum = '62' + formattedNum.substring(1);
    else if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

    console.log(`[SIDOMPUL] Processing: ${formattedNum}`);

    // --- D. CEK KOMPATIBILITAS NODE.JS ---
    if (typeof fetch === 'undefined') {
        throw new Error("SERVER ERROR: Node.js Version terlalu lama. Mohon update ke Node 18.x di Settings Vercel.");
    }

    // --- E. REQUEST KE SIDOMPUL ---
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

    // Cek Status HTTP
    if (response.status === 401) {
        throw new Error("Token Sidompul EXPIRED/SALAH. Ambil token baru di Termux & update di Vercel.");
    }
    
    // Cek Content-Type Response (Mencegah Error < HTML)
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON Response from XL:", text);
        throw new Error(`Server XL Error (Bukan JSON): ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    // Validasi Isi Data
    if (!json.result || !json.result.data) {
        throw new Error(json.statusDescription || "Gagal mengambil data (Nomor tidak ditemukan/salah).");
    }

    // --- F. PARSING DATA ---
    let finalPackages = [];
    const rawData = json.result.data; 
    let cardExp = "-";

    if (Array.isArray(rawData)) {
        if(rawData.length > 0) cardExp = rawData[0].expDate; 

        rawData.forEach(pkg => {
            if (pkg.benefits && Array.isArray(pkg.benefits)) {
                pkg.benefits.forEach(benefit => {
                    finalPackages.push({
                        name: `${pkg.name} - ${benefit.bname || benefit.name || 'DATA'}`, 
                        total: benefit.quota,
                        remaining: benefit.remaining, 
                        exp_date: pkg.expDate,
                        type: benefit.type
                    });
                });
            } else {
                finalPackages.push({
                    name: pkg.name,
                    total: "Unknown",
                    remaining: "Active",
                    exp_date: pkg.expDate
                });
            }
        });
    }

    // SUCCESS
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
    console.error("[CRITICAL ERROR]", error);
    // Mengembalikan JSON Error agar tidak muncul "< Unexpected Token"
    return res.status(500).json({ 
        success: false, 
        message: error.message || 'Internal Server Error',
        debug: error.toString() 
    });
  }
}
