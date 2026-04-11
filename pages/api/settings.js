import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ error: 'Supabase not configured' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // GET — load settings
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No settings yet — return defaults
      return res.status(200).json({ settings: null });
    }
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ settings: data });
  }

  // PUT — save settings
  if (req.method === 'PUT') {
    const body = req.body;
    const row = {
      id: user.id,
      exclude_keywords: body.excludeKeywords,
      conditions: body.conditions,
      discord_webhook: body.discordWebhook || null,
      bin_only: body.binOnly !== false,
      max_pages: body.maxPages,
      send_to_sheets: body.sendToSheets,
      send_to_discord: body.sendToDiscord,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_settings')
      .upsert(row, { onConflict: 'id' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
