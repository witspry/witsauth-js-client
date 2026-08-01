# @witsauth/js-client

The official pure JavaScript/TypeScript client library for integrating WitsAuth Single Sign-On (SSO) authentication into any JavaScript application. 

This SDK is completely framework-agnostic. It works seamlessly with Vanilla JS, Vue, Svelte, Angular, or any other modern web framework without relying on React or external dependencies like Axios.

## Features
- **100% Framework Agnostic:** Pure JavaScript and TypeScript.
- **Zero Dependencies:** Extremely lightweight bundle using native browser APIs (`fetch`, `crypto`).
- **OAuth 2.0 & PKCE:** Secure authorization code flow with Proof Key for Code Exchange built-in.
- **Auto-Refresh:** Automatically handles token rotation and refreshing behind the scenes.
- **Event-Driven:** Easy subscription model to react to authentication state changes.

## Installation

```bash
npm install @witsauth/js-client
# or
pnpm install @witsauth/js-client
# or
yarn add @witsauth/js-client
```

## Basic Usage

### 1. Initialize the Client

Create a single instance of `WitsAuthClient` and configure it with your WitsAuth credentials.

```javascript
import { WitsAuthClient } from '@witsauth/js-client';

const authClient = new WitsAuthClient({
  clientId: 'your-client-id',
  authorizationEndpoint: 'https://auth.yourdomain.com/authorize',
  tokenEndpoint: 'https://auth.yourdomain.com/token',
  redirectUri: 'http://localhost:3000/callback',
  // Optional configuration
  autoRefresh: true,
  refreshThreshold: 60, // Refresh 60 seconds before expiry
  logLevel: 'warn'
});

// Initialize the client (checks existing tokens and starts auto-refresh if applicable)
authClient.init();
```

### 2. Subscribe to State Changes

You can listen for authentication state changes to update your UI dynamically.

```javascript
const unsubscribe = authClient.subscribe((state) => {
  if (state.isLoading) {
    console.log('Authentication in progress...');
  } else if (state.isAuthenticated) {
    console.log('Logged in successfully!');
    console.log('Access Token:', state.tokenInfo.accessToken);
  } else {
    console.log('User is logged out.');
  }
});
```

### 3. Trigger Login

Call `.login()` to redirect the user to the WitsAuth SSO page.

```javascript
document.getElementById('login-btn').addEventListener('click', () => {
  authClient.login();
});
```

### 4. Handle the Callback

On your designated callback page (e.g., `http://localhost:3000/callback`), capture the `code` and `state` parameters from the URL and pass them to the client.

```javascript
// On your /callback route:
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

if (code && state) {
  authClient.handleCallback(code, state)
    .then(tokenInfo => {
      // Successfully authenticated!
      // The client will automatically redirect to your configured `redirectRoute` if set.
      window.location.href = '/dashboard';
    })
    .catch(err => {
      console.error('Authentication failed:', err);
    });
}
```

### 5. Making Authenticated API Calls

Whenever you need to call your backend API, simply retrieve the current token from the client and inject it into your headers.

```javascript
async function fetchSecureData() {
  const token = authClient.getAccessToken();
  
  if (!token) {
    throw new Error("No access token available!");
  }

  const response = await fetch('https://api.yourdomain.com/data', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  return response.json();
}
```

### 6. Logout

```javascript
document.getElementById('logout-btn').addEventListener('click', () => {
  authClient.logout();
});
```

## License
GPL-3.0
