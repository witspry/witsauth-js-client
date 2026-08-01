export interface OAuth2Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear?(): void;
}

export interface OAuth2Config {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  revokeEndpoint?: string;
  userInfoEndpoint?: string;
  scope?: string;
  audience?: string;
  responseType?: string;
  codeChallengeMethod?: 'S256';
  storage?: 'localStorage' | 'sessionStorage' | 'custom';
  customStorage?: OAuth2Storage;
  autoRefresh?: boolean;
  refreshThreshold?: number;
  logLevel?: 'none' | 'error' | 'warn' | 'info' | 'debug';
  nonce?: string;
  redirectRoute?: string;
  logoutRedirectRoute?: string;
  oAuthProvider?: 'witsauth' | string;
  theme?: 'light' | 'dark' | 'system' | (() => 'light' | 'dark' | 'system' | string);
}

export interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  scope?: string;
  idToken?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  tokenInfo?: TokenInfo;
  error?: string;
}

export interface UserInfo {
  sub?: string;
  name?: string;
  email?: string;
  [key: string]: any;
}

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'witsauth_access_token',
  REFRESH_TOKEN: 'witsauth_refresh_token',
  TOKEN_EXPIRES_AT: 'witsauth_expires_at',
  TOKEN_TYPE: 'witsauth_token_type',
  SCOPE: 'witsauth_scope',
  CODE_VERIFIER: 'witsauth_code_verifier',
  STATE: 'witsauth_state',
  NONCE: 'witsauth_nonce'
};
