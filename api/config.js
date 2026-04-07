module.exports = async (req, res) => {
  // Return public Supabase config (these are safe to expose — they're public keys)
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
};
