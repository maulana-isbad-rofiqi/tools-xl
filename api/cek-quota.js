// api/cek-quota.js
export default async function handler(req, res) {
  // Setup Header agar bisa diakses dari frontend mana saja (CORS)
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

  if (!number) {
    return res.status(400).json({ error: 'Nomor tidak boleh kosong' });
  }

  // Format nomor (08 -> 628)
  let formattedNum = number.replace(/\D/g, '');
  if (formattedNum.startsWith('0')) formattedNum = '62' + formattedNum.substring(1);
  else if (formattedNum.startsWith('8')) formattedNum = '62' + formattedNum;

  try {
    // Panggil API Sumber (Server Side Fetching)
    const apiUrl = `https://bendith.my.id/end.php?check=package&number=${formattedNum}&version=2`;
    
    const response = await fetch(apiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    
    const data = await response.json();
    return res.status(200).json(data);
    
  } catch (error) {
    return res.status(500).json({ error: 'Gagal mengambil data dari server pusat.' });
  }
}
