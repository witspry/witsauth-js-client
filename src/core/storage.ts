import { STORAGE_KEYS, OAuth2Storage } from '../models/types';

export class TokenStorage {
  private memoryStorage = new Map<string, string>();

  constructor(
    private storageType?: 'localStorage' | 'sessionStorage' | 'custom',
    private customStorage?: OAuth2Storage
  ) {}

  private getStorage(): OAuth2Storage {
    if (this.storageType === 'custom' && this.customStorage) {
      return this.customStorage;
    }

    if (typeof window !== 'undefined') {
      try {
        if (this.storageType === 'sessionStorage' && window.sessionStorage) {
          return window.sessionStorage;
        }
        if ((!this.storageType || this.storageType === 'localStorage') && window.localStorage) {
          return window.localStorage;
        }
      } catch (err) {
        // Web storage access can throw SecurityError if blocked/disabled.
        // Ignore the error and fall through to memory storage.
      }
    }
    
    const store = this.memoryStorage;
    // Fallback in-memory storage for non-browser environments
    return {
      getItem: (key: string) => store.has(key) ? store.get(key) as string : null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    };
  }

  setItem(key: string, value: string): void {
    this.getStorage().setItem(key, value);
  }

  getItem(key: string): string | null {
    return this.getStorage().getItem(key);
  }

  removeItem(key: string): void {
    this.getStorage().removeItem(key);
  }

  clearTokens(): void {
    const storage = this.getStorage();
    storage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    storage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    storage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
    storage.removeItem(STORAGE_KEYS.TOKEN_TYPE);
    storage.removeItem(STORAGE_KEYS.SCOPE);
  }

  clearTemporary(): void {
    const storage = this.getStorage();
    storage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
    storage.removeItem(STORAGE_KEYS.STATE);
    storage.removeItem(STORAGE_KEYS.NONCE);
  }
}
