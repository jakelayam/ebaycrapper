import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Missing env' });

  const sb = createClient(url, key);

  // Try to update a product with exclude_keywords to test if column exists
  const { data: products } = await sb.from('products').select('id').limit(1);
  if (!products || products.length === 0) return res.status(200).json({ error: 'no products' });

  const { error } = await sb
    .from('products')
    .update({ exclude_keywords: ['test1', 'test2'] })
    .eq('id', products[0].id);

  if (error) {
    return res.status(500).json({ columnExists: false, error: error.message, code: error.code });
  }

  // Read it back
  const { data } = await sb.from('products').select('*').eq('id', products[0].id).single();
  res.status(200).json({ columnExists: true, sample: data });
}
