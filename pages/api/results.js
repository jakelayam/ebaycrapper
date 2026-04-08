import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return res.status(200).json({ results: null });

  const token = (req.headers.authorization || '').replace('Bearer ', '');

  // Get user ID from token
  let userId = null;
  if (token && anonKey) {
    const authSb = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user } } = await authSb.auth.getUser(token);
    userId = user?.id;
  }

  // Use service key for queries (bypasses RLS but we filter manually by user_id)
  const sb = createClient(url, serviceKey || anonKey);

  const all = req.query.all === 'true';

  if (all) {
    let query = sb.from('scrape_results').select('*').order('created_at', { ascending: false }).limit(50);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) return res.status(200).json({ history: [] });
    return res.status(200).json({ history: data });
  }

  // Latest single result for this user
  let query = sb.from('scrape_results').select('*').order('created_at', { ascending: false }).limit(1);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.single();

  if (error) return res.status(200).json({ results: null });

  res.status(200).json({
    deals: data.deals,
    scanned: data.scanned,
    results: data.results,
    timestamp: data.created_at,
  });
}
