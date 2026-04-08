import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return res.status(200).json({ results: null });

  // Must have auth token
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !anonKey) return res.status(200).json({ results: null });

  const authSb = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await authSb.auth.getUser(token);
  if (!user) return res.status(200).json({ results: null });

  const userId = user.id;
  const sb = createClient(url, serviceKey || anonKey);
  const all = req.query.all === 'true';

  if (all) {
    // Strictly only this user's results
    const { data, error } = await sb
      .from('scrape_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(200).json({ history: [] });
    return res.status(200).json({ history: data });
  }

  // Latest single result for this user only
  const { data, error } = await sb
    .from('scrape_results')
    .select('*')
    .eq('user_id', userId)
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
