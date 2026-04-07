#!/usr/bin/env node
require('dotenv').config();
const { scrapeAndNotify } = require('./scraper');

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

async function run() {
  const time = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${time}] Starting scrape cycle...`);
  console.log('='.repeat(60));

  try {
    const result = await scrapeAndNotify({
      sendToSheets: true,
      sendToDiscord: true,
    });
    console.log(`\nResult: ${result.deals} deals found, ${result.scanned} listings scanned`);
    console.log(`Sheets: ${result.sheetsStatus}`);
    console.log(`Discord: ${result.discordStatus}`);
  } catch (err) {
    console.error('Scrape failed:', err.message);
  }

  console.log(`\nNext run in 30 minutes...`);
}

// Run immediately on start
run();

// Then every 30 minutes
setInterval(run, INTERVAL_MS);

console.log('eBay DDR4 RAM Scraper - Running every 30 minutes');
console.log('Press Ctrl+C to stop\n');
