const { scrapeAndNotify } = require('./scraper');

async function main() {
  process.env.CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    // No Supabase — run with defaults
    const r = await scrapeAndNotify({ sendToSheets: false, sendToDiscord: true, maxPages: 10 });
    console.log('Deals:', r.deals, '| Scanned:', r.scanned);
    return;
  }

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(sbUrl, sbKey);

  // Get all users who have products
  const { data: allProducts } = await sb.from('products').select('created_by').eq('active', true);
  const uniqueUsers = [...new Set((allProducts || []).map(u => u.created_by).filter(Boolean))];
  console.log('Found', uniqueUsers.length, 'users with products');

  // Scrape per user — each user gets their own filters applied
  for (const uid of uniqueUsers) {
    console.log('\n=== Scraping for user:', uid, '===');

    // Load user's products
    const { data: products } = await sb.from('products').select('*').eq('created_by', uid).eq('active', true);
    if (!products || products.length === 0) continue;

    const searchQueries = products.map(p => ({
      query: p.query,
      maxPrice: parseFloat(p.max_price),
      type: p.type,
      excludeKeywords: p.exclude_keywords || [],
    }));
    console.log('Products:', searchQueries.map(q => q.query).join(', '));

    // Load user's settings (exclude keywords, conditions, discord webhook)
    const { data: settings } = await sb.from('user_settings').select('*').eq('id', uid).single();

    const excludeKeywords = settings?.exclude_keywords || [];
    const conditions = settings?.conditions || ['new', 'used', 'refurbished'];
    const userWebhook = settings?.discord_webhook || null;
    const maxPages = settings?.max_pages || 10;
    const binOnly = settings?.bin_only !== false;

    console.log('Exclude keywords:', excludeKeywords.length ? excludeKeywords.join(', ') : '(none)');
    console.log('Conditions:', conditions.join(', '));
    console.log('Discord webhook:', userWebhook ? 'set' : 'using default');

    // Each user only gets Discord if they have their own webhook set
    // Admin uses the default DISCORD_WEBHOOK_URL env var
    const origWebhook = process.env.DISCORD_WEBHOOK_URL;
    let sendDiscord = false;

    // Check if user is admin (has 'admin' role in profiles or user_metadata)
    const { data: profile } = await sb.from('profiles').select('role').eq('id', uid).single();
    const isAdmin = profile?.role === 'admin';

    if (userWebhook) {
      process.env.DISCORD_WEBHOOK_URL = userWebhook;
      sendDiscord = true;
    } else if (isAdmin && origWebhook) {
      // Admin uses the default env webhook
      sendDiscord = true;
    }
    // Customers without a webhook get no Discord alerts

    const r = await scrapeAndNotify({
      sendToSheets: false,
      sendToDiscord: sendDiscord,
      maxPages,
      searchQueries,
      excludeKeywords,
      conditions,
      binOnly,
    });

    // Restore original webhook
    process.env.DISCORD_WEBHOOK_URL = origWebhook;

    console.log('User', uid, ':', r.deals, 'deals from', r.scanned, 'listings');
    console.log('Discord:', r.discordStatus);

    // Save results to Supabase for this user
    if (r.results && r.results.length > 0) {
      const { error } = await sb.from('scrape_results').insert({
        user_id: uid,
        deals: r.deals,
        scanned: r.scanned,
        results: r.results,
      });
      if (error) console.error('Save error:', error.message);
      else console.log('Saved', r.deals, 'results to Supabase');
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
