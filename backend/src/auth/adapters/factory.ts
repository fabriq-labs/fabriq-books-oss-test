import { AuthAdapter, AuthProvider, AuthProviderConfig } from '../types';
import { ClerkAuthAdapter } from './clerk';
import { LocalAuthAdapter } from './local';

export class AuthAdapterFactory {
  private static instance: AuthAdapterFactory;
  private adapters: Map<AuthProvider, AuthAdapter> = new Map();

  private constructor() { }

  static getInstance(): AuthAdapterFactory {
    if (!AuthAdapterFactory.instance) {
      AuthAdapterFactory.instance = new AuthAdapterFactory();
    }
    return AuthAdapterFactory.instance;
  }

  getAdapter(config: AuthProviderConfig): AuthAdapter {
    const { provider } = config;

    if (!this.adapters.has(provider)) {
      const adapter = this.createAdapter(config);
      this.adapters.set(provider, adapter);
    }

    return this.adapters.get(provider)!;
  }

  private createAdapter(config: AuthProviderConfig): AuthAdapter {
    switch (config.provider) {
      case 'clerk':
        return new ClerkAuthAdapter(config);
      case 'local':
        return new LocalAuthAdapter(config);
      case 'auth0':
        throw new Error('Auth0 adapter not implemented yet');
      case 'cognito':
        throw new Error('Cognito adapter not implemented yet');
      default:
        throw new Error(`Unsupported auth provider: ${config.provider}`);
    }
  }
} 