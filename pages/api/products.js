import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Supabase not configured' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // GET — list user's own products only
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .eq('created_by', user.id)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ products: data });
  }

  // POST — add product owned by this user
  if (req.method === 'POST') {
    const { query, maxPrice, type, excludeKeywords } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const { data, error } = await supabase.from('products').insert({
      query,
      max_price: maxPrice || 9999,
      type: type || 'general',
      exclude_keywords: excludeKeywords || [],
      created_by: user.id,
    }).select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ product: data[0] });
  }

  // PUT — update own product
  if (req.method === 'PUT') {
    const { id, query, maxPrice, type, excludeKeywords } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const updates = {};
    if (query !== undefined) updates.query = query;
    if (maxPrice !== undefined) updates.max_price = maxPrice;
    if (type !== undefined) updates.type = type;
    if (excludeKeywords !== undefined) updates.exclude_keywords = excludeKeywords;

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .eq('created_by', user.id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ product: data?.[0] });
  }

  // DELETE — remove only own product
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('created_by', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
