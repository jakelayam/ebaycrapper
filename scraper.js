#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const GoogleSheetsClient = require('./google-sheets-client');
const DiscordWebhook = require('./discord-webhook');

const DEFAULT_EXCLUDE_KEYWORDS = [];
const DEFAULT_CONDITIONS = ['new', 'used', 'refurbished'];

const DEFAULT_SEARCH_QUERIES = [
  { query: 'DDR4 32GB', maxPrice: 100, type: 'ram' },
  { query: 'DDR4 64GB', maxPrice: 200, type: 'ram' },
  { query: 'DDR4 128GB', maxPrice: 500, type: 'ram' },
];

const USE_BROWSER = !process.env.VERCEL;
let _browser = null;

async function getBrowser() {
  if (!USE_BROWSER) return null;
  if (_browser && _browser.connected) return _browser;
  const puppeteer = require('puppeteer-core');
  const chromePath = process.env.CHROME_PATH || (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome');
  _browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  return _browser;
}

async function closeBrowser() {
  if (_browser) { await _browser.close().catch(() => {}); _browser = null; }
}

async function fetchEbayPage(url) {
  if (USE_BROWSER) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('li.s-item, li.s-card', { timeout: 8000 }).catch(() => {});
      return await page.content();
    } finally {
      await page.close();
    }
  }
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    timeout: 10000,
  });
  return response.data;
}

function cleanTitle(raw) {
  return raw.replace(/^New Listing/, '').replace(/Opens in a new window or tab$/i, '').trim();
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// RAM-specific helpers
function parsePerStickCapacity(title) {
  const kitMatch = title.match(/(\d+)\s*x\s*(\d+)\s*GB/i);
  if (kitMatch) return parseInt(kitMatch[2]);
  const totalMatch = title.match(/\b(\d+)\s*GB\b/ig);
  if (totalMatch) {
    const values = totalMatch.map(m => parseInt(m));
    const maxVal = Math.max(...values);
    if ([32, 64, 128].includes(maxVal)) return maxVal;
  }
  return null;
}

function getStickCount(title) {
  const match = title.match(/(\d+)\s*x\s*(\d+)\s*GB/i);
  return match ? parseInt(match[1]) : 1;
}

function isValidDDR4RAM(title) {
  const t = title.toLowerCase();
  const excluded = ['persistent memory', 'pmem', 'optane', 'persistent module', 'nvm memory', 'non-volatile memory'];
  if (excluded.some(p => t.includes(p))) return false;
  if (!t.includes('ddr4')) return false;
  return true;
}

// Generic listing parser — works for any product
// searchQuery: { query: 'DDR4 32GB', maxPrice: 100, type: 'ram' }
// searchQuery: { query: 'Better Pack 555', maxPrice: 400, type: 'general' }
function parseListings(html, searchQuery, options = {}) {
  const $ = cheerio.load(html);
  const maxPrice = searchQuery.maxPrice || 9999;
  const isRAM = searchQuery.type === 'ram';
  // Per-product excludes take precedence, fall back to global
  const excludeKeywords = (searchQuery.excludeKeywords && searchQuery.excludeKeywords.length > 0)
    ? searchQuery.excludeKeywords
    : (options.excludeKeywords || DEFAULT_EXCLUDE_KEYWORDS);
  const conditions = options.conditions || DEFAULT_CONDITIONS;
  const deals = [];

  const listingSelectors = ['li.s-card', 'li.s-item', 'div.s-item__wrapper'];
  let $listings = $([]);
  for (const selector of listingSelectors) {
    $listings = $(selector);
    if ($listings.length > 0) break;
  }

  if ($listings.length === 0) return { deals, listingsOnPage: 0 };

  // For RAM queries, extract the target GB from the query
  let targetGB = null;
  if (isRAM) {
    const gbMatch = searchQuery.query.match(/(\d+)\s*GB/i);
    if (gbMatch) targetGB = parseInt(gbMatch[1]);
  }

  $listings.each((i, el) => {
    try {
      const $el = $(el);
      const titleEl = $el.find('.s-card__title, .s-item__title, [role="heading"]').first();
      const rawTitle = titleEl.length ? titleEl.text().trim() : '';
      if (!rawTitle || rawTitle === 'Shop on eBay') return;
      const title = cleanTitle(rawTitle);
      if (!title || title.length < 5) return;

      // Relevance check: title must contain all key words from search query
      const queryWords = searchQuery.query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
      const titleLowerCheck = title.toLowerCase();
      const matchCount = queryWords.filter(w => titleLowerCheck.includes(w)).length;
      // Require at least 70% of query words to match (e.g. 3 of 4 words)
      if (queryWords.length > 0 && matchCount / queryWords.length < 0.7) return;

      // Skip auctions
      const fullText = $el.text().toLowerCase();
      const auctionPatterns = ['starting at', 'current bid', 'bid now', 'place bid', ' bids'];
      if (auctionPatterns.some(p => fullText.includes(p))) return;

      // Price
      const $priceEl = $el.find('.s-card__price, .s-item__price, [data-test-id="PRICE"]').first();
      const priceText = $priceEl.length ? $priceEl.text() : '';
      const priceMatch = priceText.match(/\$([\d,]+\.?\d*)/);
      if (!priceMatch) return;
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (!price || isNaN(price)) return;

      // Exclude keywords
      const titleLower = title.toLowerCase();
      if (excludeKeywords.some(p => titleLower.includes(p.toLowerCase()))) return;

      // Condition
      let condition = 'Used';
      const $condEl = $el.find('.s-card__subtitle, .SECONDARY_INFO, .s-item__subtitle').first();
      if ($condEl.length) condition = $condEl.text().trim();
      const condLower = condition.toLowerCase();
      if (conditions.length > 0) {
        const condMatches = conditions.some(c => {
          if (c === 'new') return condLower.includes('new') && !condLower.includes('pre-owned') && !condLower.includes('refurb');
          if (c === 'used') return condLower.includes('used') || condLower.includes('pre-owned');
          if (c === 'refurbished') return condLower.includes('refurb');
          return false;
        });
        if (!condMatches) return;
      }

      // RAM-specific filters
      let stickCount = 1;
      let perStickCost = price.toFixed(2);
      let effectivePrice = price;

      if (isRAM) {
        if (!isValidDDR4RAM(title)) return;
        if (targetGB) {
          const stickSize = parsePerStickCapacity(title);
          if (stickSize !== targetGB) return;
        }
        stickCount = getStickCount(title);
        perStickCost = (price / stickCount).toFixed(2);
        effectivePrice = parseFloat(perStickCost);
      }

      // Price check (per-stick for RAM, total price for general)
      if (effectivePrice >= maxPrice) return;

      // Link
      let link = 'N/A';
      $el.find('a').each((j, a) => {
        const href = $(a).attr('href') || '';
        if (href.includes('/itm/') && link === 'N/A') link = href;
      });

      // Seller
      let seller = 'Unknown';
      const $sellerEl = $el.find('[class*="seller"]').first();
      if ($sellerEl.length) seller = $sellerEl.text().trim();

      deals.push({
        timestamp: new Date().toISOString(),
        searchQuery: searchQuery.query,
        type: searchQuery.type || 'general',
        title,
        price: price.toFixed(2),
        maxPrice: maxPrice.toFixed(2),
        stickCount,
        perStickCost,
        condition,
        seller,
        link,
        alertedAt: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
      });
    } catch (err) { /* skip */ }
  });

  return { deals, listingsOnPage: $listings.length };
}

async function fetchAndParse(url, searchQuery, options) {
  const html = await fetchEbayPage(url);
  return parseListings(html, searchQuery, options);
}

async function scrapeQuery(searchQuery, options) {
  const maxPages = options.maxPages || 10;
  const queryText = searchQuery.query;
  const encodedQuery = encodeURIComponent(queryText);
  const deals = [];
  let scanned = 0;

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sop=10&rt=nc&LH_BIN=1&_pgn=${page}`;

    try {
      console.log(`[${queryText}] page ${page}...`);
      const result = await fetchAndParse(url, searchQuery, options);

      scanned += result.listingsOnPage;
      deals.push(...result.deals);
      console.log(`  => ${result.listingsOnPage} listings, ${result.deals.length} deals`);

      if (result.listingsOnPage === 0) {
        console.log(`[${queryText}] no more results, done`);
        break;
      }
      // Note: with newly-listed sort, we can't smart-stop on 0 deals
      // because matching items could be on any page

      if (USE_BROWSER) await delay(process.env.CI ? 500 : 1500);
    } catch (err) {
      console.error(`[${queryText}] page ${page} error: ${err.message}`);
      break;
    }
  }

  console.log(`[${queryText}] total ${deals.length} deals from ${scanned} listings`);
  return { query: queryText, deals, scanned };
}

async function scrapeEbay(options = {}) {
  const searchQueries = options.searchQueries || DEFAULT_SEARCH_QUERIES;
  const seenLinks = new Set();
  let allDeals = [];
  let totalScanned = 0;

  let queryResults;
  if (USE_BROWSER) {
    queryResults = [];
    for (const sq of searchQueries) {
      queryResults.push(await scrapeQuery(sq, options));
    }
  } else {
    queryResults = await Promise.all(
      searchQueries.map(sq => scrapeQuery(sq, options))
    );
  }

  for (const result of queryResults) {
    totalScanned += result.scanned;
    for (const deal of result.deals) {
      if (deal.link === 'N/A' || !seenLinks.has(deal.link)) {
        if (deal.link !== 'N/A') seenLinks.add(deal.link);
        allDeals.push(deal);
      }
    }
    console.log(`[${result.query}] ${result.deals.length} deals from ${result.scanned} listings`);
  }

  await closeBrowser();
  return { deals: allDeals, scanned: totalScanned };
}

async function scrapeAndNotify(options = {}) {
  const sendToSheets = options.sendToSheets !== false;
  const sendToDiscord = options.sendToDiscord !== false;

  console.log('eBay Scraper started');

  const scrapeResult = await scrapeEbay(options);
  const allDeals = scrapeResult.deals;
  const scanned = scrapeResult.scanned;
  console.log(`Scanned ${scanned} listings, found ${allDeals.length} deals`);

  if (allDeals.length === 0) {
    return { deals: 0, scanned, results: [], sheetsStatus: 'skipped', discordStatus: 'skipped' };
  }

  // Keep newly-listed order from eBay (no re-sort)

  let sheetsStatus = 'skipped';
  let discordStatus = 'skipped';

  if (sendToSheets) {
    try {
      const sheetsClient = new GoogleSheetsClient();
      await sheetsClient.clearDeals();
      await sheetsClient.appendDeals(allDeals);
      sheetsStatus = 'sent';
    } catch (err) {
      sheetsStatus = 'error: ' + err.message;
    }
  }

  if (sendToDiscord) {
    try {
      const discord = new DiscordWebhook();
      await discord.sendDeals(allDeals);
      discordStatus = 'sent';
    } catch (err) {
      discordStatus = 'error: ' + err.message;
    }
  }

  return { deals: allDeals.length, scanned, results: allDeals, sheetsStatus, discordStatus };
}

module.exports = { scrapeAndNotify, DEFAULT_EXCLUDE_KEYWORDS, DEFAULT_CONDITIONS, DEFAULT_SEARCH_QUERIES };

if (require.main === module) {
  scrapeAndNotify()
    .then((result) => { console.log(`Done. ${result.deals} deals, ${result.scanned} scanned.`); process.exit(0); })
    .catch((error) => { console.error('Fatal error:', error.message); process.exit(1); });
}
