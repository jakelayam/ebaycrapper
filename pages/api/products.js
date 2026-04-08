import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Supabase not configured' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const supabase = token
    ? createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    : createClient(url, anonKey);

  // GET — list active products
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ products: data });
  }

  // POST — add new product
  if (req.method === 'POST') {
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { query, maxPrice, type } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const { data, error } = await supabase.from('products').insert({
      query,
      max_price: maxPrice || 9999,
      type: type || 'general',
      created_by: user.id,
    }).select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ product: data[0] });
  }

  // DELETE — remove product
  if (req.method === 'DELETE') {
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
