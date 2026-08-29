export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const upstream = await fetch('https://api.edelmetalle.de/public.json', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Alltag-Mobile/1.2 (+https://alltag-mobile.vercel.app)'
      }
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: 'gold_de_unavailable', status: upstream.status });
    }

    const payload = await upstream.json();
    const ounceEur = Number(payload.gold_eur);
    if (!Number.isFinite(ounceEur) || ounceEur <= 0) {
      return res.status(502).json({ error: 'invalid_gold_de_response' });
    }

    const gramEur = ounceEur / 31.1034768;
    const timestamp = Number(payload.timestamp) || Math.floor(Date.now() / 1000);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      source: 'GOLD.DE',
      copyright: '© GOLD.DE',
      ounceEur,
      gramEur,
      timestamp
    });
  } catch (error) {
    return res.status(500).json({ error: 'gold_fetch_failed' });
  }
}
