import { OAuth2Config, AuthState, TokenInfo, STORAGE_KEYS } from '../models/types';
import { generateCodeVerifier, generateState, createCodeChallenge } from './pkce';
import { TokenStorage } from './storage';

export class WitsAuthClient {
  private config: OAuth2Config;
  private storage: TokenStorage;
  private authState: AuthState;
  private listeners: Set<(state: AuthState) => void> = new Set();
  private refreshIntervalId: ReturnType<typeof setInterval> | null = null;
  private isRefreshing: boolean = false;

  constructor(config: OAuth2Config, storage?: TokenStorage) {
    this.config = config;
    this.storage = storage || new TokenStorage(config.storage, config.customStorage);
    this.authState = {
      isAuthenticated: false,
      isLoading: true
    };
  }

  /**
   * Initializes the client. Checks existing tokens and starts auto-refresh if configured.
   */
  async init(): Promise<void> {
    try {
      if (this.hasValidToken()) {
        this.updateState({ isAuthenticated: true, isLoading: false, tokenInfo: this.getTokenInfoFromStorage() });
        this.startAutoRefresh();
      } else if (this.storage.getItem(STORAGE_KEYS.REFRESH_TOKEN)) {
        try {
          const tokens = await this.refreshAccessToken();
          this.updateState({ isAuthenticated: true, isLoading: false, tokenInfo: tokens });
          this.startAutoRefresh();
        } catch {
          this.updateState({ isAuthenticated: false, isLoading: false });
        }
      } else {
        this.updateState({ isAuthenticated: false, isLoading: false });
      }
    } catch (err) {
      this.updateState({ 
        isAuthenticated: false, 
        isLoading: false, 
        error: err instanceof Error ? err.message : String(err) 
      });
    }
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    // Immediately call listener with current state
    listener(this.authState);
    return () => this.listeners.delete(listener);
  }

  private updateState(newState: Partial<AuthState>) {
    this.authState = { ...this.authState, ...newState };
    this.listeners.forEach(listener => listener(this.authState));
  }

  getState(): AuthState {
    return this.authState;
  }

  log(level: 'error' | 'warn' | 'info' | 'debug', ...args: any[]): void {
    const levels = { none: 0, error: 1, warn: 2, info: 3, debug: 4 };
    const currentLevel = levels[this.config.logLevel || 'warn'] || 0;
    const msgLevel = levels[level] || 0;
    
    if (msgLevel > 0 && currentLevel >= msgLevel) {
      console[level](...args);
    }
  }

  async login(): Promise<void> {
    this.updateState({ isLoading: true });
    
    const verifier = generateCodeVerifier();
    const challenge = await createCodeChallenge(verifier);
    const state = generateState();
    const nonce = this.config.nonce || generateState();

    this.storage.setItem(STORAGE_KEYS.CODE_VERIFIER, verifier);
    this.storage.setItem(STORAGE_KEYS.STATE, state);
    this.storage.setItem(STORAGE_KEYS.NONCE, nonce);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: this.config.responseType || 'code',
      code_challenge_method: this.config.codeChallengeMethod || 'S256',
      code_challenge: challenge,
      state,
      nonce
    });

    if (this.config.theme) {
      const themeVal = typeof this.config.theme === 'function' ? this.config.theme() : this.config.theme;
      if (themeVal) {
        params.append('theme', themeVal);
      }
    }

    if (this.config.scope) params.append('scope', this.config.scope);
    if (this.config.audience) params.append('audience', this.config.audience);

    const authUrl = `${this.config.authorizationEndpoint}?${params.toString()}`;
    
    if (typeof window === 'undefined' || !window.location) {
      throw new Error('login requires a browser environment to redirect the user.');
    }

    window.location.href = authUrl;
  }

  async handleCallback(code: string, state: string): Promise<TokenInfo> {
    this.updateState({ isLoading: true });
    try {
      const storedState = this.storage.getItem(STORAGE_KEYS.STATE);
      const verifier = this.storage.getItem(STORAGE_KEYS.CODE_VERIFIER);

      if (state !== storedState) {
        throw new Error('Invalid state parameter. Possible CSRF attack.');
      }
      if (!verifier) {
        throw new Error('Code verifier missing from storage.');
      }

      const formData = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        code,
        code_verifier: verifier
      });

      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });

      if (!response.ok) {
        throw new Error('Failed to exchange code for tokens');
      }

      const data = await response.json();
      
      const tokenInfo: TokenInfo = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type || 'Bearer',
        expiresAt: Date.now() + (data.expires_in * 1000),
        scope: data.scope,
        idToken: data.id_token
      };

      this.saveTokenInfo(tokenInfo);
      this.storage.clearTemporary();

      this.updateState({ isAuthenticated: true, isLoading: false, tokenInfo });
      this.startAutoRefresh();

      if (this.config.redirectRoute && typeof window !== 'undefined') {
        setTimeout(() => {
          window.location.assign(this.config.redirectRoute!);
        }, 0);
      }

      return tokenInfo;
    } catch (err) {
      this.updateState({ 
        isAuthenticated: false, 
        isLoading: false, 
        error: err instanceof Error ? err.message : String(err) 
      });
      throw err;
    }
  }

  async refreshAccessToken(): Promise<TokenInfo> {
    const refreshToken = this.storage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const formData = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: refreshToken
    });

    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    if (!response.ok) {
      this.storage.clearTokens();
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();

    const tokenInfo: TokenInfo = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      tokenType: data.token_type || 'Bearer',
      expiresAt: Date.now() + (data.expires_in * 1000),
      scope: data.scope,
      idToken: data.id_token
    };

    this.saveTokenInfo(tokenInfo);
    return tokenInfo;
  }

  private saveTokenInfo(info: TokenInfo): void {
    this.storage.setItem(STORAGE_KEYS.ACCESS_TOKEN, info.accessToken);
    this.storage.setItem(STORAGE_KEYS.TOKEN_EXPIRES_AT, info.expiresAt.toString());
    this.storage.setItem(STORAGE_KEYS.TOKEN_TYPE, info.tokenType);
    if (info.refreshToken) {
      this.storage.setItem(STORAGE_KEYS.REFRESH_TOKEN, info.refreshToken);
    }
    if (info.scope) {
      this.storage.setItem(STORAGE_KEYS.SCOPE, info.scope);
    }
  }

  private getTokenInfoFromStorage(): TokenInfo | undefined {
    const accessToken = this.storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const expiresAt = this.getExpiresAt();
    
    if (!accessToken || !expiresAt) return undefined;
    
    return {
      accessToken,
      expiresAt,
      tokenType: this.storage.getItem(STORAGE_KEYS.TOKEN_TYPE) || 'Bearer',
      refreshToken: this.storage.getItem(STORAGE_KEYS.REFRESH_TOKEN) || undefined,
      scope: this.storage.getItem(STORAGE_KEYS.SCOPE) || undefined
    };
  }

  getAccessToken(): string | null {
    return this.storage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  getExpiresAt(): number | null {
    const expiresAt = this.storage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
    if (!expiresAt) return null;
    const parsed = Number(expiresAt);
    return Number.isFinite(parsed) ? parsed : null;
  }

  hasValidToken(): boolean {
    const expiresAt = this.getExpiresAt();
    if (expiresAt === null) return false;
    
    // Add small buffer (e.g. 30s) to consider it expired early
    const isValid = Date.now() < (expiresAt - 30000);
    return isValid && !!this.getAccessToken();
  }

  private startAutoRefresh() {
    if (this.config.autoRefresh === false) return;
    this.stopAutoRefresh(); // Clear any existing interval

    this.refreshIntervalId = setInterval(async () => {
      if (this.isRefreshing) return;

      try {
        const expiresAt = this.getExpiresAt();
        if (!expiresAt) return;
        
        const thresholdMs = (this.config.refreshThreshold ?? 60) * 1000;
        
        if (Date.now() >= expiresAt - thresholdMs) {
          this.isRefreshing = true;
          try {
            const tokens = await this.refreshAccessToken();
            this.updateState({ tokenInfo: tokens });
          } catch (err) {
            // Refresh failed, token is completely expired or revoked
            await this.logout();
          } finally {
            this.isRefreshing = false;
          }
        }
      } catch (err) {
        this.log('error', 'Auto-refresh error:', err);
      }
    }, 10000); // Check every 10 seconds
  }

  private stopAutoRefresh() {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }

  async navigateToAccountManagement(): Promise<void> {
    const refreshToken = this.storage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) {
      throw new Error('No refresh token available to access account management.');
    }

    if (typeof window === 'undefined' || !document) {
      throw new Error('navigateToAccountManagement requires a browser environment.');
    }

    const form = document.createElement('form');
    form.method = 'POST';
    
    const authEndpointBase = this.config.authorizationEndpoint.replace(/\/authorize\/?$/, '');
    form.action = `${authEndpointBase}/account/session`;

    const addInput = (name: string, value: string) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };

    try {
      const csrfResponse = await fetch(`${authEndpointBase}/csrf-token`, { credentials: 'include' });
      const data = await csrfResponse.json();
      if (data.csrfToken) {
        addInput('_csrf', data.csrfToken);
      }
    } catch (err) {
      this.log('warn', 'Failed to fetch CSRF token for Account Management navigation', err);
    }

    addInput('refreshToken', refreshToken);
    addInput('clientId', this.config.clientId);
    addInput('redirectUri', this.config.redirectUri);

    document.body.appendChild(form);
    form.submit();
  }

  async logout(): Promise<void> {
    this.updateState({ isLoading: true });
    
    const token = this.getAccessToken();
    
    this.storage.clearTokens();
    this.storage.clearTemporary();
    this.stopAutoRefresh();
    
    if (this.config.revokeEndpoint && token) {
      try {
        await fetch(this.config.revokeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }).toString()
        });
      } catch (err) {
        this.log('error', 'Failed to revoke token during logout', err);
      }
    }

    this.updateState({ isAuthenticated: false, isLoading: false, tokenInfo: undefined });
      
    if (this.config.logoutRedirectRoute && typeof window !== 'undefined') {
      window.location.assign(this.config.logoutRedirectRoute);
    }
  }
}
