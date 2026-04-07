import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Verify user is authenticated
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { error } = await supabase.auth.getUser(token);
    if (error) return res.status(401).json({ error: 'Invalid token' });
  }

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured in Vercel env vars' });
  }

  try {
    // Trigger the GitHub Actions workflow
    const response = await fetch(
      'https://api.github.com/repos/jakelayam/ebaycrapper/actions/workflows/scrape.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );

    if (response.status === 204) {
      return res.status(200).json({ success: true, message: 'Scrape triggered. Check Discord in ~5 minutes.' });
    }

    const body = await response.text();
    return res.status(response.status).json({ error: 'GitHub API error: ' + body });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
