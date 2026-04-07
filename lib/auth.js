const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

// Verify a Supabase JWT from the Authorization header
async function verifyAuth(req) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  // If Supabase not configured, skip auth (dev mode)
  if (!url || !anonKey) return { authenticated: true, user: null };

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { authenticated: false, error: error?.message || 'Invalid token' };
    }

    return { authenticated: true, user };
  } catch (err) {
    return { authenticated: false, error: err.message };
  }
}

module.exports = { verifyAuth, getSupabaseAdmin };
