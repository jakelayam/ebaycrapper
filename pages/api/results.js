import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(200).json({ results: null });

  const sb = createClient(url, key);
  const all = req.query.all === 'true';

  if (all) {
    // Return all scrape runs
    const { data, error } = await sb
      .from('scrape_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(200).json({ history: [] });
    return res.status(200).json({ history: data });
  }

  // Return latest single run
  const { data, error } = await sb
    .from('scrape_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return res.status(200).json({ results: null });

  res.status(200).json({
    deals: data.deals,
    scanned: data.scanned,
    results: data.results,
    timestamp: data.created_at,
  });
}
