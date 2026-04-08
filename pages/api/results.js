import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(200).json({ results: null, history: [] });

  // Get user ID from auth token
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !anonKey) return res.status(200).json({ results: null, history: [] });

  const authSb = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authErr } = await authSb.auth.getUser(token);
  if (authErr || !user) return res.status(200).json({ results: null, history: [] });

  // Use service key to query (bypasses RLS, we filter by user_id)
  const sb = createClient(url, serviceKey);
  const userId = user.id;
  const all = req.query.all === 'true';

  if (all) {
    const { data, error } = await sb
      .from('scrape_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    return res.status(200).json({ history: data || [] });
  }

  const { data, error } = await sb
    .from('scrape_results')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return res.status(200).json({ results: null });

  res.status(200).json({
    deals: data.deals,
    scanned: data.scanned,
    results: data.results,
    timestamp: data.created_at,
  });
}
