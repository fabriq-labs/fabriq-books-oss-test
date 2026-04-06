#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Xero OAuth 2.0 Setup Helper

This script helps you obtain the initial OAuth refresh token for Xero.
Run this locally once to get the refresh_token, then add it to Railway env vars.

Usage:
    1. Create a Xero app at https://developer.xero.com/app/manage
    2. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET environment variables
    3. Run: python oauth_setup.py
    4. Follow the browser prompts to authorize
    5. Copy the refresh_token to Railway environment variables

Requirements:
    pip install requests
"""

import os
import sys
import json
import webbrowser
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Configuration
REDIRECT_URI = "http://localhost:3000/callback"
SCOPES = [
    "openid",
    "profile", 
    "email",
    "accounting.transactions.read",
    "accounting.contacts.read",
    "accounting.settings.read",
    "offline_access",  # Required for refresh token
]


def load_env():
    """Load environment from .env file."""
    env_file = Path(__file__).parent / '.env'
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip())


class OAuthCallbackHandler(BaseHTTPRequestHandler):
    """HTTP handler for OAuth callback."""
    
    authorization_code = None
    
    def do_GET(self):
        """Handle GET request from OAuth callback."""
        parsed = urllib.parse.urlparse(self.path)
        
        if parsed.path == '/callback':
            query_params = urllib.parse.parse_qs(parsed.query)
            
            if 'code' in query_params:
                OAuthCallbackHandler.authorization_code = query_params['code'][0]
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b"""
                    <html>
                    <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                        <h1>Authorization Successful!</h1>
                        <p>You can close this window and return to the terminal.</p>
                    </body>
                    </html>
                """)
            else:
                error = query_params.get('error', ['Unknown error'])[0]
                self.send_response(400)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(f"""
                    <html>
                    <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                        <h1>Authorization Failed</h1>
                        <p>Error: {error}</p>
                    </body>
                    </html>
                """.encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        """Suppress HTTP logs."""
        pass


def get_authorization_url(client_id: str) -> str:
    """Build Xero authorization URL."""
    base_url = "https://login.xero.com/identity/connect/authorize"
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "scope": " ".join(SCOPES),
        "state": "xero_oauth_setup",
    }
    return f"{base_url}?{urllib.parse.urlencode(params)}"


def exchange_code_for_tokens(client_id: str, client_secret: str, code: str) -> dict:
    """Exchange authorization code for access and refresh tokens."""
    import requests
    
    token_url = "https://identity.xero.com/connect/token"
    
    response = requests.post(
        token_url,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
            "client_secret": client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    
    if response.status_code != 200:
        raise Exception(f"Token exchange failed: {response.text}")
    
    return response.json()


def get_tenant_connections(access_token: str) -> list:
    """Get list of connected Xero organizations (tenants)."""
    import requests
    
    response = requests.get(
        "https://api.xero.com/connections",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    if response.status_code != 200:
        raise Exception(f"Failed to get connections: {response.text}")
    
    return response.json()


def main():
    """Main OAuth setup flow."""
    print("=" * 60)
    print("Xero OAuth 2.0 Setup")
    print("=" * 60)
    
    # Load environment
    load_env()
    
    # Get credentials
    client_id = os.getenv("XERO_CLIENT_ID")
    client_secret = os.getenv("XERO_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        print("\nError: XERO_CLIENT_ID and XERO_CLIENT_SECRET must be set.")
        print("\nYou can either:")
        print("  1. Set environment variables")
        print("  2. Create a .env file with:")
        print("     XERO_CLIENT_ID=your_client_id")
        print("     XERO_CLIENT_SECRET=your_client_secret")
        print("\nGet these from: https://developer.xero.com/app/manage")
        sys.exit(1)
    
    print(f"\nClient ID: {client_id[:10]}...")
    print(f"Redirect URI: {REDIRECT_URI}")
    print(f"Scopes: {', '.join(SCOPES)}")
    
    # Build auth URL
    auth_url = get_authorization_url(client_id)
    
    print("\n" + "=" * 60)
    print("Step 1: Authorize with Xero")
    print("=" * 60)
    print("\nOpening browser for authorization...")
    print(f"If browser doesn't open, visit:\n{auth_url}\n")
    
    # Start callback server
    server = HTTPServer(('localhost', 3000), OAuthCallbackHandler)
    
    # Open browser
    webbrowser.open(auth_url)
    
    print("Waiting for authorization callback...")
    
    # Wait for callback
    while OAuthCallbackHandler.authorization_code is None:
        server.handle_request()
    
    code = OAuthCallbackHandler.authorization_code
    print(f"\n✅ Authorization code received")
    
    # Exchange code for tokens
    print("\n" + "=" * 60)
    print("Step 2: Exchanging code for tokens")
    print("=" * 60)
    
    try:
        tokens = exchange_code_for_tokens(client_id, client_secret, code)
        print("✅ Tokens obtained successfully")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)
    
    # Get tenant connections
    print("\n" + "=" * 60)
    print("Step 3: Getting connected organizations")
    print("=" * 60)
    
    try:
        connections = get_tenant_connections(tokens['access_token'])
        print(f"\nFound {len(connections)} connected organization(s):")
        for i, conn in enumerate(connections):
            print(f"  {i+1}. {conn['tenantName']} (ID: {conn['tenantId']})")
        
        if connections:
            tenant_id = connections[0]['tenantId']
            tenant_name = connections[0]['tenantName']
        else:
            print("\n⚠️  No organizations connected. Please connect an organization in Xero.")
            tenant_id = "YOUR_TENANT_ID"
            tenant_name = "Unknown"
    except Exception as e:
        print(f"\n⚠️  Could not get connections: {e}")
        tenant_id = "YOUR_TENANT_ID"
        tenant_name = "Unknown"
    
    # Output results
    print("\n" + "=" * 60)
    print("Step 4: Your Xero Credentials")
    print("=" * 60)
    print("\nAdd these to your Railway environment variables:\n")
    print(f"XERO_CLIENT_ID={client_id}")
    print(f"XERO_CLIENT_SECRET={client_secret}")
    print(f"XERO_TENANT_ID={tenant_id}")
    print(f"XERO_REFRESH_TOKEN={tokens['refresh_token']}")
    print("XERO_START_DATE=2024-01-01")
    
    print("\n" + "-" * 60)
    print("Token Details:")
    print("-" * 60)
    print(f"Organization: {tenant_name}")
    print(f"Tenant ID: {tenant_id}")
    print(f"Access Token expires in: {tokens.get('expires_in', 'N/A')} seconds")
    print(f"Refresh Token: {tokens['refresh_token'][:20]}...")
    
    # Save to file
    output_file = Path(__file__).parent / '.xero_tokens.json'
    with open(output_file, 'w') as f:
        json.dump({
            "client_id": client_id,
            "tenant_id": tenant_id,
            "tenant_name": tenant_name,
            "refresh_token": tokens['refresh_token'],
            "access_token": tokens['access_token'],
            "expires_in": tokens.get('expires_in'),
        }, f, indent=2)
    print(f"\n✅ Tokens saved to: {output_file}")
    print("   (Keep this file secure, do not commit to git)")
    
    print("\n" + "=" * 60)
    print("Setup Complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()

