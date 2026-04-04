#!/usr/bin/env ts-node

/**
 * Script to generate a new Zoho Books refresh token for a specific organization
 * 
 * This script guides you through the OAuth 2.0 flow:
 * 1. Generates an authorization URL
 * 2. Opens it in your browser
 * 3. You authorize the app and get a grant token
 * 4. Exchanges the grant token for access and refresh tokens
 * 
 * Usage:
 *   ts-node scripts/generate-zoho-refresh-token.ts
 * 
 * Requires environment variables:
 *   - ZOHO_CLIENT_ID
 *   - ZOHO_CLIENT_SECRET
 *   - ZOHO_REDIRECT_URI (must match the one registered in Zoho Developer Console)
 * 
 * Optional:
 *   - ZOHO_ACCOUNTS_DOMAIN (defaults to accounts.zoho.com for US)
 *     Options: accounts.zoho.com, accounts.zoho.com.au, accounts.zoho.eu, 
 *              accounts.zoho.in, accounts.zoho.com.cn, accounts.zoho.jp
 */

import * as readline from 'readline';
import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Zoho Accounts domains by region
const ZOHO_ACCOUNTS_DOMAINS = {
  US: 'https://accounts.zoho.com',
  AU: 'https://accounts.zoho.com.au',
  EU: 'https://accounts.zoho.eu',
  IN: 'https://accounts.zoho.in',
  CN: 'https://accounts.zoho.com.cn',
  JP: 'https://accounts.zoho.jp',
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  api_domain: string;
  token_type: string;
  expires_in: number;
}

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function generateRefreshToken() {
  const rl = createReadlineInterface();

  try {
    console.log('🔐 Zoho Books OAuth 2.0 Refresh Token Generator\n');
    console.log('─'.repeat(80));

    // Check for required environment variables
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const redirectUri = process.env.ZOHO_REDIRECT_URI;

    if (!clientId || !clientSecret) {
      console.error('\n❌ Missing required environment variables:');
      console.error('   - ZOHO_CLIENT_ID');
      console.error('   - ZOHO_CLIENT_SECRET');
      console.error('\nPlease set these in your .env file.');
      process.exit(1);
    }

    if (!redirectUri) {
      console.error('\n❌ Missing ZOHO_REDIRECT_URI');
      console.error('   This must match the redirect URI registered in your Zoho Developer Console.');
      console.error('   Common values: http://localhost:8080 or https://yourdomain.com/callback');
      const customRedirect = await question(rl, '\nEnter your redirect URI: ');
      if (!customRedirect) {
        console.error('❌ Redirect URI is required.');
        process.exit(1);
      }
      process.env.ZOHO_REDIRECT_URI = customRedirect;
    }

    // Determine accounts domain
    const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || ZOHO_ACCOUNTS_DOMAINS.US;
    console.log(`\n✓ Using Zoho Accounts domain: ${accountsDomain}`);
    console.log(`✓ Client ID: ${clientId.substring(0, 10)}...`);
    console.log(`✓ Redirect URI: ${process.env.ZOHO_REDIRECT_URI}\n`);

    // Step 1: Generate authorization URL
    console.log('📋 Step 1: Generate Authorization URL\n');
    
    // Zoho Books scopes (adjust as needed)
    const scopes = [
      'ZohoBooks.fullaccess.all',
    ].join(',');

    const authUrl = `${accountsDomain}/oauth/v2/auth?` +
      `scope=${encodeURIComponent(scopes)}&` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `response_type=code&` +
      `access_type=offline&` + // This ensures we get a refresh token
      `redirect_uri=${encodeURIComponent(process.env.ZOHO_REDIRECT_URI!)}`;

    console.log('Authorization URL:');
    console.log(authUrl);
    console.log('\n─'.repeat(80));

    // Step 2: Open browser and get grant token
    console.log('\n📋 Step 2: Authorize the Application\n');
    console.log('Please open the URL above in your browser.\n');

    console.log('Instructions:');
    console.log('1. Log in to your Zoho account');
    console.log('2. Select the organization you want to generate tokens for');
    console.log('3. Authorize the application');
    console.log('4. You will be redirected to your redirect URI');
    console.log('5. Copy the "code" parameter from the URL (it looks like: code=1000.abc123...)\n');

    const grantToken = await question(rl, 'Paste the grant token (code) here: ');

    if (!grantToken) {
      console.error('❌ Grant token is required.');
      process.exit(1);
    }

    // Clean up the grant token (remove any URL parameters if user pasted full URL)
    const cleanGrantToken = grantToken.split('code=').pop()?.split('&')[0] || grantToken;

    console.log('\n─'.repeat(80));
    console.log('\n📋 Step 3: Exchange Grant Token for Access and Refresh Tokens\n');
    console.log('Exchanging grant token...\n');

    // Step 3: Exchange grant token for access and refresh tokens
    const tokenUrl = `${accountsDomain}/oauth/v2/token`;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: process.env.ZOHO_REDIRECT_URI!,
      code: cleanGrantToken,
    });

    const response = await axios.post<TokenResponse>(tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.data.access_token && response.data.refresh_token) {
      console.log('✅ Successfully generated tokens!\n');
      console.log('─'.repeat(80));
      console.log('\n📋 Your New Tokens:\n');
      console.log(`Access Token: ${response.data.access_token.substring(0, 20)}...`);
      console.log(`Refresh Token: ${response.data.refresh_token}`);
      console.log(`API Domain: ${response.data.api_domain}`);
      console.log(`Token Type: ${response.data.token_type}`);
      console.log(`Expires In: ${response.data.expires_in} seconds (${response.data.expires_in / 60} minutes)\n`);

      console.log('─'.repeat(80));
      console.log('\n📝 Add these to your .env file:\n');
      console.log(`ZOHO_REFRESH_TOKEN=${response.data.refresh_token}`);
      if (response.data.api_domain !== 'https://www.zohoapis.com') {
        const apiDomain = response.data.api_domain.replace('https://', '');
        console.log(`ZOHO_API_DOMAIN=${apiDomain}`);
      }

      // Optionally, fetch organization info to show which org this token is for
      try {
        const booksApiUrl = `${response.data.api_domain}/books/v3`;
        const orgResponse = await axios.get(`${booksApiUrl}/organizations`, {
          headers: {
            'Authorization': `Zoho-oauthtoken ${response.data.access_token}`,
          },
        });

        if (orgResponse.data.organizations && orgResponse.data.organizations.length > 0) {
          console.log('\n─'.repeat(80));
          console.log('\n📋 Organizations accessible with this token:\n');
          orgResponse.data.organizations.forEach((org: any, index: number) => {
            console.log(`${index + 1}. ${org.organization_name || 'Unnamed Organization'}`);
            console.log(`   Organization ID: ${org.organization_id}`);
            console.log(`   Company ID: ${org.company_id || 'N/A'}\n`);
          });
        }
      } catch (error) {
        console.log('\n⚠️  Could not fetch organization info (this is okay, token is still valid)');
      }

      console.log('\n✅ Done! Your refresh token is ready to use.\n');
    } else {
      console.error('❌ Failed to get tokens from response:', response.data);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error generating refresh token:');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
      
      if (error.response.data?.error === 'invalid_code') {
        console.error('\n💡 The grant token has expired or was already used.');
        console.error('   Please run the script again to get a new grant token.');
      } else if (error.response.data?.error === 'invalid_client') {
        console.error('\n💡 Invalid client ID or secret, or domain mismatch.');
        console.error('   Ensure you\'re using the correct domain for your Zoho account.');
      } else if (error.response.data?.error === 'invalid_redirect_uri') {
        console.error('\n💡 Redirect URI mismatch.');
        console.error('   Ensure ZOHO_REDIRECT_URI matches what\'s registered in Zoho Developer Console.');
      }
    } else {
      console.error(error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the script
generateRefreshToken();

