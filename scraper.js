#!/usr/bin/env node
require('dotenv').config();
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const GoogleSheetsClient = require('./google-sheets-client');
const DiscordWebhook = require('./discord-webhook');

const DEFAULT_THRESHOLDS = {
  '32GB': 100,
  '64GB': 200,
  '128GB': 500,
};

const DEFAULT_CAPACITIES = ['32GB', '64GB', '128GB'];

const DEFAULT_EXCLUDE_KEYWORDS = ['broken', 'for parts', 'untested', 'as-is', 'as is', 'not working', 'damaged'];

const DEFAULT_CONDITIONS = ['new', 'used', 'refurbished'];

// Find Chrome path based on platform
function getChromePath() {
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return '/usr/bin/google-chrome';
}

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

async function fetchEbayPage(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for listings to appear
    await page.waitForSelector('li.s-item, li.s-card', { timeout: 10000 }).catch(() => {});

    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}

function parseTotalCapacity(title) {
  const kitMatch = title.match(/(\d+)\s*x\s*(\d+)\s*GB/i);
  if (kitMatch) return parseInt(kitMatch[1]) * parseInt(kitMatch[2]);
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

function cleanTitle(raw) {
  return raw.replace(/^New Listing/, '').replace(/Opens in a new window or tab$/i, '').trim();
}

function parseListings(html, capacity, options = {}) {
  const $ = cheerio.load(html);
  const gbValue = parseInt(capacity);
  const thresholds = options.thresholds || DEFAULT_THRESHOLDS;
  const threshold = thresholds[capacity] || thresholds[`${gbValue}GB`] || 999;
  const excludeKeywords = options.excludeKeywords || DEFAULT_EXCLUDE_KEYWORDS;
  const conditions = options.conditions || DEFAULT_CONDITIONS;
  const deals = [];

  const listingSelectors = ['li.s-card', 'li.s-item', 'div.s-item__wrapper'];
  let $listings = $([]);
  for (const selector of listingSelectors) {
    $listings = $(selector);
    if ($listings.length > 0) break;
  }

  if ($listings.length === 0) return { deals, listingsOnPage: 0 };

  $listings.each((i, el) => {
    try {
      const $el = $(el);
      const titleEl = $el.find('.s-card__title, .s-item__title, [role="heading"]').first();
      const rawTitle = titleEl.length ? titleEl.text().trim() : '';
      if (!rawTitle || rawTitle === 'Shop on eBay') return;
      const title = cleanTitle(rawTitle);
      if (!title || title.length < 5) return;

      // Auction check
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

      if (!isValidDDR4RAM(title)) return;

      const titleLower = title.toLowerCase();
      if (excludeKeywords.some(p => titleLower.includes(p.toLowerCase()))) return;

      // Condition
      let condition = 'Used';
      const $condEl = $el.find('.s-card__subtitle, .SECONDARY_INFO, .s-item__subtitle').first();
      if ($condEl.length) condition = $condEl.text().trim();
      const condLower = condition.toLowerCase();
      const condMatches = conditions.some(c => {
        if (c === 'new') return condLower.includes('new') && !condLower.includes('pre-owned') && !condLower.includes('refurb');
        if (c === 'used') return condLower.includes('used') || condLower.includes('pre-owned');
        if (c === 'refurbished') return condLower.includes('refurb');
        return false;
      });
      if (conditions.length > 0 && !condMatches) return;

      const parsedCapacity = parseTotalCapacity(title);
      if (parsedCapacity !== gbValue) return;

      const stickCount = getStickCount(title);
      const perStickCost = (price / stickCount).toFixed(2);
      if (parseFloat(perStickCost) >= threshold) return;

      let link = 'N/A';
      $el.find('a').each((j, a) => {
        const href = $(a).attr('href') || '';
        if (href.includes('/itm/') && link === 'N/A') link = href;
      });

      let seller = 'Unknown';
      const $sellerEl = $el.find('[class*="seller"]').first();
      if ($sellerEl.length) seller = $sellerEl.text().trim();

      deals.push({
        timestamp: new Date().toISOString(),
        capacity: `${gbValue}GB`,
        title, price: price.toFixed(2), stickCount, perStickCost,
        condition, seller, link,
        alertedAt: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
      });
    } catch (err) { /* skip */ }
  });

  return { deals, listingsOnPage: $listings.length };
}

// Fetch a single page and parse it
async function fetchAndParse(url, capacity, options) {
  const html = await fetchEbayPage(url);
  const result = parseListings(html, capacity, options);
  return result;
}

// Fetch multiple pages in parallel (batch)
async function fetchBatch(urls, capacity, options) {
  const results = await Promise.all(
    urls.map(url =>
      fetchAndParse(url, capacity, options).catch(err => {
        console.error(`  Fetch error: ${err.message}`);
        return { deals: [], listingsOnPage: 0 };
      })
    )
  );
  return results;
}

async function scrapeEbay(options = {}) {
  const thresholds = options.thresholds || DEFAULT_THRESHOLDS;
  const capacities = options.capacities || DEFAULT_CAPACITIES;
  const maxPages = options.maxPages || 1000;
  const seenLinks = new Set();
  let allDeals = [];
  let totalScanned = 0;

  // Scrape all capacities in parallel
  const capacityResults = await Promise.all(capacities.map(async (capacity) => {
    const deals = [];
    let scanned = 0;
    const BATCH_SIZE = 5; // fetch 5 pages at once

    for (let startPage = 1; startPage <= maxPages; startPage += BATCH_SIZE) {
      const endPage = Math.min(startPage + BATCH_SIZE - 1, maxPages);
      const urls = [];
      for (let p = startPage; p <= endPage; p++) {
        urls.push(`https://www.ebay.com/sch/i.html?_nkw=DDR4+${capacity}&_sop=15&rt=nc&_pgn=${p}`);
      }

      console.log(`${capacity}: fetching pages ${startPage}-${endPage}...`);
      const results = await fetchBatch(urls, capacity, { thresholds, ...options });

      let batchScanned = 0;
      let batchDeals = 0;
      let emptyPages = 0;

      for (const result of results) {
        batchScanned += result.listingsOnPage;
        batchDeals += result.deals.length;
        if (result.listingsOnPage === 0) emptyPages++;
        deals.push(...result.deals);
      }

      scanned += batchScanned;
      console.log(`${capacity}: pages ${startPage}-${endPage} => ${batchScanned} listings, ${batchDeals} deals`);

      // Stop if we got empty pages (no more results from eBay)
      if (emptyPages >= BATCH_SIZE) {
        console.log(`${capacity}: no more results from eBay, done`);
        break;
      }

      // Stop if entire batch had 0 deals and we're past page 2
      // (prices sorted ascending — if a full batch has 0 deals, rest won't either)
      if (batchDeals === 0 && startPage > 1) {
        console.log(`${capacity}: no deals in batch, prices above threshold, done`);
        break;
      }
    }

    return { capacity, deals, scanned };
  }));

  // Merge and dedup
  for (const result of capacityResults) {
    totalScanned += result.scanned;
    for (const deal of result.deals) {
      if (deal.link === 'N/A' || !seenLinks.has(deal.link)) {
        if (deal.link !== 'N/A') seenLinks.add(deal.link);
        allDeals.push(deal);
      }
    }
    console.log(`${result.capacity}: ${result.deals.length} deals from ${result.scanned} listings`);
  }

  await closeBrowser();
  return { deals: allDeals, scanned: totalScanned };
}

async function scrapeAndNotify(options = {}) {
  const sendToSheets = options.sendToSheets !== false;
  const sendToDiscord = options.sendToDiscord !== false;

  console.log('eBay DDR4 RAM Scraper started');

  const scrapeResult = await scrapeEbay(options);
  const allDeals = scrapeResult.deals;
  const scanned = scrapeResult.scanned;
  console.log(`Scanned ${scanned} listings, found ${allDeals.length} deals`);

  if (allDeals.length === 0) {
    return { deals: 0, scanned, results: [], sheetsStatus: 'skipped', discordStatus: 'skipped' };
  }

  allDeals.sort((a, b) => parseFloat(a.perStickCost) - parseFloat(b.perStickCost));

  let sheetsStatus = 'skipped';
  let discordStatus = 'skipped';

  if (sendToSheets) {
    try {
      const sheetsClient = new GoogleSheetsClient();
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

module.exports = { scrapeAndNotify, DEFAULT_THRESHOLDS, DEFAULT_CAPACITIES, DEFAULT_EXCLUDE_KEYWORDS, DEFAULT_CONDITIONS };

if (require.main === module) {
  scrapeAndNotify()
    .then((result) => { console.log(`Done. ${result.deals} deals, ${result.scanned} scanned.`); process.exit(0); })
    .catch((error) => { console.error('Fatal error:', error.message); process.exit(1); });
}
