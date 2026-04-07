#!/usr/bin/env node
/**
 * One-time Google OAuth setup.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a project & enable "Google Sheets API"
 *   3. Create OAuth 2.0 credentials (Desktop app)
 *   4. Download credentials.json and place it at: ~/.openclaw/google/credentials.json
 *
 * Then run: node google-auth-setup.js
 * It will open a browser for you to authorize, then save token.json
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const home = process.env.HOME || process.env.USERPROFILE;
const GOOGLE_DIR = path.join(home, '.openclaw', 'google');
const CRED_PATH = path.join(GOOGLE_DIR, 'credentials.json');
const TOKEN_PATH = path.join(GOOGLE_DIR, 'token.json');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  // Ensure directory exists
  fs.mkdirSync(GOOGLE_DIR, { recursive: true });

  if (!fs.existsSync(CRED_PATH)) {
    console.error(`\n❌ credentials.json not found at: ${CRED_PATH}`);
    console.error(`\nPlease download it from Google Cloud Console and place it there.`);
    console.error(`Steps:`);
    console.error(`  1. Go to https://console.cloud.google.com/apis/credentials`);
    console.error(`  2. Create OAuth 2.0 Client ID (Desktop app)`);
    console.error(`  3. Download the JSON and save as: ${CRED_PATH}`);
    process.exit(1);
  }

  if (fs.existsSync(TOKEN_PATH)) {
    console.log(`✅ token.json already exists at: ${TOKEN_PATH}`);
    console.log(`Delete it and re-run this script to re-authorize.`);
    printEnvInstructions();
    return;
  }

  const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log(`\n🌐 Opening browser for authorization...\n`);
  console.log(`If it doesn't open, visit this URL:\n${authUrl}\n`);

  // Open browser
  const open = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  require('child_process').exec(`${open} "${authUrl}"`);

  // Start local server to catch the callback
  const server = http.createServer(async (req, res) => {
    const query = url.parse(req.url, true).query;
    if (query.code) {
      try {
        const { tokens } = await oauth2Client.getToken(query.code);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log(`\n✅ Token saved to: ${TOKEN_PATH}`);
        printEnvInstructions();
        res.end('Authorization successful! You can close this tab.');
      } catch (err) {
        console.error('❌ Error getting token:', err.message);
        res.end('Authorization failed. Check the console.');
      }
      server.close();
    }
  });

  server.listen(3333, () => {
    console.log('Waiting for authorization callback on http://localhost:3333 ...');
  });
}

function printEnvInstructions() {
  const creds = fs.readFileSync(CRED_PATH, 'utf8');
  const token = fs.readFileSync(TOKEN_PATH, 'utf8');

  console.log(`\n📋 Add these to your .env file for Vercel deployment:\n`);
  console.log(`GOOGLE_CREDENTIALS=${creds.replace(/\n/g, '').replace(/\s+/g, '')}`);
  console.log(`GOOGLE_TOKEN=${token.replace(/\n/g, '').replace(/\s+/g, '')}`);
}

main().catch(console.error);
