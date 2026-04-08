import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Missing env' });

  const sb = createClient(url, key);
  const { data, error } = await sb.from('products').select('id, query, max_price, type, created_by, active').order('created_at');

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ products: data });
}
