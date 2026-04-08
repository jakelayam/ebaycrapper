const { scrapeAndNotify } = require('./scraper');

async function main() {
  process.env.CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';

  // Load all active products from all users in Supabase
  let searchQueries;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let sb;

  if (sbUrl && sbKey) {
    const { createClient } = require('@supabase/supabase-js');
    sb = createClient(sbUrl, sbKey);
    const { data: products } = await sb.from('products').select('*').eq('active', true);
    if (products && products.length > 0) {
      searchQueries = products.map(p => ({ query: p.query, maxPrice: parseFloat(p.max_price), type: p.type }));
      console.log('Loaded', searchQueries.length, 'products from Supabase');
    }
  }

  const r = await scrapeAndNotify({ sendToSheets: false, sendToDiscord: true, maxPages: 10, searchQueries });
  console.log('Deals:', r.deals, '| Scanned:', r.scanned);
  console.log('Discord:', r.discordStatus);

  // Save results to Supabase per user
  if (sb) {
    const { data: users } = await sb.from('products').select('created_by').eq('active', true);
    const uniqueUsers = [...new Set((users || []).map(u => u.created_by).filter(Boolean))];

    for (const uid of uniqueUsers) {
      const { data: userProducts } = await sb.from('products').select('*').eq('created_by', uid).eq('active', true);
      const userQueries = (userProducts || []).map(p => p.query.toLowerCase());

      const userResults = (r.results || []).filter(deal =>
        userQueries.some(q => (deal.searchQuery || '').toLowerCase().includes(q) || q.includes((deal.searchQuery || '').toLowerCase()))
      );

      if (userResults.length > 0) {
        const { error } = await sb.from('scrape_results').insert({
          user_id: uid,
          deals: userResults.length,
          scanned: r.scanned,
          results: userResults,
        });
        if (error) console.error('Save error for user', uid, error.message);
        else console.log('Saved', userResults.length, 'results for user', uid);
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
