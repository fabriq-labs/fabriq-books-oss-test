# Fabriq Authentication System - Complete Guide

**When to read**: Authentication issues, implementing new auth providers, security fixes

**Conceptual overview (auth + RBAC + tenancy):** [AUTHENTICATION_AND_AUTHORIZATION.md](./AUTHENTICATION_AND_AUTHORIZATION.md)

**Related docs**: [BACKEND.md](./BACKEND.md), [DEPLOYMENT.md](./DEPLOYMENT.md)

**Last Updated**: 2026-01-02
**Status**: Local & Clerk adapters implemented | SuperTokens planned for production

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Current Implementation](#current-implementation)
3. [Architecture](#architecture)
4. [Authentication Providers](#authentication-providers)
5. [Implementation Review](#implementation-review)
6. [SuperTokens Integration](#supertokens-integration)
7. [Recommendations](#recommendations)
8. [Migration Guide](#migration-guide)
9. [Security Best Practices](#security-best-practices)

---

## 🎯 Overview

The Fabriq authentication system uses a **provider-agnostic architecture** with an adapter pattern that supports multiple authentication providers. The system currently implements **Local JWT** and **Clerk** adapters, with **SuperTokens** planned for production deployment.

### Key Features

✅ **Multi-Provider Support** - Plugin architecture for different auth providers
✅ **JWT-Based Authentication** - Stateless token authentication
✅ **Role-Based Access Control** - Integration with permission system
✅ **Organization Isolation** - Multi-tenant support
✅ **Factory Pattern** - Easy provider switching via configuration

---

## 🏗️ Current Implementation

### File Structure

```
src/auth/
├── types.ts                    # TypeScript interfaces
├── middleware.ts               # Auth middleware & context creation
├── routes.ts                   # Login/register endpoints
└── adapters/
    ├── factory.ts              # Adapter factory (Singleton)
    ├── local.ts                # Local JWT adapter ✅
    ├── clerk.ts                # Clerk adapter ✅
    └── supertokens.ts          # SuperTokens adapter (TODO)
```

### Configuration

**Environment Variables**:
```bash
# Provider selection
AUTH_PROVIDER=local              # local | clerk | supertokens

# Local/JWT configuration
JWT_SECRET=your-secret-key-here

# Clerk configuration
AUTH_SECRET_KEY=clerk-secret-key

# SuperTokens configuration (planned)
SUPERTOKENS_CONNECTION_URI=...
SUPERTOKENS_API_KEY=...
```

---

## 🔧 Architecture

### 1. Adapter Pattern

All authentication providers implement the `AuthAdapter` interface:

```typescript
export interface AuthAdapter {
  authenticate(req: ExpressRequest, res: ExpressResponse): Promise<AuthContext>;
  getUserId(req: ExpressRequest): Promise<string | null>;
  isAuthenticated(req: ExpressRequest): Promise<boolean>;
}
```

**Benefits**:
- ✅ Consistent interface across providers
- ✅ Easy to add new providers
- ✅ Provider switching via configuration
- ✅ Testable in isolation

### 2. Authentication Flow

```
CLIENT REQUEST
    ↓
[Extract Token from Authorization header]
    ↓
[AuthAdapter.authenticate()]
    → Verify token (JWT/Clerk/SuperTokens)
    → Extract user claims
    ↓
[Lookup user in database]
    → Query: WHERE external_id = claims.sub
    → Validate org_id exists
    ↓
[Load permissions via PermissionService]
    → Get user roles
    → Get role views
    → Get field permissions
    ↓
[Create AuthContext]
    → user: { id, email, org_id, name }
    → permissions: { model: { field: 'read'|'write' } }
    ↓
[Attach to req.context.auth]
    ↓
CONTINUE TO ROUTE HANDLER
```

### 3. Key Components

#### AuthContext
```typescript
export interface AuthContext {
  user: User;                      // User info from database
  permissions?: Permissions;       // Computed permissions
  model?: string;                  // Current model context
  view?: string;                   // Current view context
  instance_id?: string;            // Workflow instance (if applicable)
  session?: {                      // Session metadata
    id: string;
    iat: number;
    exp: number;
  };
}
```

#### User Model
```typescript
export interface User {
  id: string;           // Database user ID
  email: string;        // User email
  name: string | null;  // User name
  org_id: string;       // Organization ID (required)
}
```

---

## 🔐 Authentication Providers

### 1. Local JWT Adapter (✅ Implemented)

**File**: `src/auth/adapters/local.ts`

**How It Works**:
1. Extracts JWT from `Authorization: Bearer <token>` header
2. Verifies token using `JWT_SECRET`
3. Returns user info from JWT claims

**Token Structure**:
```json
{
  "sub": "user-external-id",     // External ID for DB lookup
  "email": "user@example.com",
  "name": "User Name",
  "roles": ["Administrator"],
  "iat": 1234567890,
  "exp": 1234654290
}
```

**Login Endpoint**: `POST /api/auth/login`
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```

**Response**:
```json
{
  "user": {
    "id": "user_admin",
    "name": "System Admin",
    "email": "admin@example.com",
    "roles": ["Super Admin"]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Pros**:
- ✅ Simple to implement and understand
- ✅ No external dependencies
- ✅ Full control over token structure
- ✅ Works offline (stateless)

**Cons**:
- ❌ No built-in session management
- ❌ No refresh token support
- ❌ Manual token invalidation (logout)
- ❌ No password reset flow
- ❌ No email verification
- ❌ Security depends on JWT_SECRET strength

### 2. Clerk Adapter (✅ Implemented)

**File**: `src/auth/adapters/clerk.ts`

**How It Works**:
1. Extracts Clerk session token from header
2. Verifies token using Clerk SDK (`verifyToken`)
3. Fetches user details from Clerk API
4. Maps Clerk user to AuthContext

**Token Verification**:
```typescript
const decoded = await verifyToken(token, {
  secretKey: config.secretKey
});
const user = await clerkClient.users.getUser(decoded.sub);
```

**Pros**:
- ✅ Full authentication UI (sign-in, sign-up, profile)
- ✅ Multi-factor authentication (MFA)
- ✅ Social login (Google, GitHub, etc.)
- ✅ Email verification built-in
- ✅ Password reset flow
- ✅ Session management
- ✅ Webhooks for user events

**Cons**:
- ❌ External service dependency
- ❌ Cost for production usage
- ❌ Requires internet connection
- ❌ Data stored on Clerk servers

### 3. SuperTokens Adapter (🔄 Planned)

**Status**: Not yet implemented

**Why SuperTokens for Production?**

SuperTokens is designed for production-grade authentication with:
- ✅ **Self-hosted option** - Full control over auth data
- ✅ **Session management** - Built-in session handling
- ✅ **Refresh tokens** - Automatic token rotation
- ✅ **Security** - Protection against common attacks (CSRF, session fixation)
- ✅ **Email/password + Social login** - Multiple auth methods
- ✅ **Multi-tenancy** - Perfect for org-based access
- ✅ **Open source** - Free for self-hosted
- ✅ **Enterprise features** - MFA, SSO, SAML (paid plans)

---

## 🔍 Implementation Review

### Current Code Analysis

#### ✅ Strengths

**1. Clean Adapter Pattern**
```typescript
// factory.ts - Well-designed singleton factory
export class AuthAdapterFactory {
  getAdapter(config: AuthProviderConfig): AuthAdapter {
    // Caches adapters, supports multiple providers
  }
}
```

**2. Comprehensive Middleware**
```typescript
// middleware.ts - Handles auth + permissions
export const authMiddleware = async (req, res, next) => {
  // 1. Authenticate via adapter
  // 2. Lookup user in DB
  // 3. Load permissions
  // 4. Create context
  // 5. Attach to request
};
```

**3. Permission Integration**
```typescript
// Automatic permission loading
const permissions = await PermissionService.getUserPermissions(user.id);
context = { user, permissions };
```

#### ⚠️ Issues Found

**1. Hardcoded Dummy Value** (🔴 Critical)
```typescript
// local.ts:35
return {
  user: {
    id: decoded.sub,
    email: decoded.email,
    name: decoded.name || decoded.email,
    org_id: 'dummy-org-id' // TODO: Remove this once we fix the type error
  }
};
```

**Issue**: Hardcoded org_id bypasses multi-tenancy
**Impact**: Security risk - user could access wrong organization
**Fix**: Remove dummy value, require org_id from database lookup

**2. Inconsistent JWT Claims**
```typescript
// routes.ts:46 - Login uses 'sub'
const token = jwt.sign({ sub: user.external_id, ... });

// routes.ts:106 - Register uses 'id'
const token = jwt.sign({ id: user.id, ... });
```

**Issue**: Inconsistent field naming
**Impact**: Adapter expects 'sub' but register uses 'id'
**Fix**: Standardize on 'sub' for external_id

**3. Missing Error Handling**
```typescript
// middleware.ts:97-105 - Catches errors but continues
catch (error) {
  logger.error('Authentication failed', { error });
  // Continue without authentication  ← Should reject?
}
next();
```

**Issue**: Failed auth doesn't block request
**Impact**: Unauthenticated requests might reach protected routes
**Fix**: Return 401 or make error handling explicit per route

**4. No Session Management**
- No logout endpoint
- No token refresh
- No session invalidation
- Tokens valid until expiry (24h)

**5. No Password Security Features**
- No password reset flow
- No email verification
- No password strength validation
- No rate limiting on login

**6. Development Endpoints in Production**
```typescript
// routes.ts:129-149
if (process.env.NODE_ENV !== 'production') {
  authRouter.post('/generate-token', ...);  // ✅ Good guard
}
```

**Status**: Properly guarded ✅

---

## 🚀 SuperTokens Integration

### Recommended Implementation

#### Step 1: Install Dependencies

```bash
npm install supertokens-node supertokens-auth-react
```

#### Step 2: Create SuperTokens Adapter

**File**: `src/auth/adapters/supertokens.ts`

```typescript
import { Request, Response } from 'express';
import SuperTokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import { AuthAdapter, AuthContext, AuthProviderConfig } from '../types';
import logger from '../../utils/logger';

export class SuperTokensAuthAdapter implements AuthAdapter {
  private config: AuthProviderConfig;

  constructor(config: AuthProviderConfig) {
    this.config = config;
    this.initSuperTokens();
  }

  private initSuperTokens() {
    SuperTokens.init({
      framework: 'express',
      supertokens: {
        connectionURI: process.env.SUPERTOKENS_CONNECTION_URI!,
        apiKey: process.env.SUPERTOKENS_API_KEY,
      },
      appInfo: {
        appName: 'Fabriq',
        apiDomain: process.env.API_DOMAIN || 'http://localhost:4000',
        websiteDomain: process.env.WEBSITE_DOMAIN || 'http://localhost:3000',
        apiBasePath: '/api/auth',
        websiteBasePath: '/auth',
      },
      recipeList: [
        EmailPassword.init(),
        Session.init({
          cookieSameSite: 'lax',
          sessionExpiredStatusCode: 401,
        }),
      ],
    });
  }

  async authenticate(req: Request, res: Response): Promise<AuthContext> {
    try {
      // Verify SuperTokens session
      const session = await Session.getSession(req, res, {
        sessionRequired: true,
      });

      if (!session) {
        throw new Error('No session found');
      }

      // Get user ID from session
      const userId = session.getUserId();

      // Get session data
      const sessionData = await session.getSessionDataFromDatabase();

      return {
        user: {
          id: userId,
          email: sessionData.email,
          name: sessionData.name || sessionData.email,
          org_id: sessionData.org_id,
        },
        session: {
          id: session.getHandle(),
          iat: session.getTimeCreated(),
          exp: session.getExpiry(),
        },
      };
    } catch (error) {
      logger.error('SuperTokens authentication failed', { error });
      throw new Error('Authentication failed');
    }
  }

  async getUserId(req: Request): Promise<string | null> {
    try {
      const session = await Session.getSession(req, null as any, {
        sessionRequired: false,
      });
      return session?.getUserId() || null;
    } catch {
      return null;
    }
  }

  async isAuthenticated(req: Request): Promise<boolean> {
    const userId = await this.getUserId(req);
    return !!userId;
  }
}
```

#### Step 3: Register in Factory

```typescript
// factory.ts
import { SuperTokensAuthAdapter } from './supertokens';

private createAdapter(config: AuthProviderConfig): AuthAdapter {
  switch (config.provider) {
    case 'clerk':
      return new ClerkAuthAdapter(config);
    case 'local':
      return new LocalAuthAdapter(config);
    case 'supertokens':
      return new SuperTokensAuthAdapter(config);  // ← Add this
    case 'auth0':
      throw new Error('Auth0 adapter not implemented yet');
    case 'cognito':
      throw new Error('Cognito adapter not implemented yet');
    default:
      throw new Error(`Unsupported auth provider: ${config.provider}`);
  }
}
```

#### Step 4: Update Types

```typescript
// types.ts
export type AuthProvider =
  | 'clerk'
  | 'auth0'
  | 'cognito'
  | 'local'
  | 'supertokens';  // ← Add this
```

#### Step 5: Setup SuperTokens Routes

```typescript
// In your main server file (index.ts)
import SuperTokens from 'supertokens-node';
import { middleware } from 'supertokens-node/framework/express';

// Add SuperTokens middleware
app.use(middleware());

// Optional: Override default APIs
import EmailPassword from 'supertokens-node/recipe/emailpassword';

// Custom sign-up handler
EmailPassword.init({
  override: {
    apis: (originalImplementation) => {
      return {
        ...originalImplementation,
        signUpPOST: async function (input) {
          // Custom logic before sign-up
          const response = await originalImplementation.signUpPOST!(input);

          if (response.status === 'OK') {
            // Create user in Prisma with org_id
            await prisma.user.create({
              data: {
                external_id: response.user.id,
                email: response.user.email,
                auth_provider: 'supertokens',
                org_id: input.formFields.find(f => f.id === 'org_id')?.value,
              },
            });
          }

          return response;
        },
      };
    },
  },
});
```

#### Step 6: Configuration

```bash
# .env
AUTH_PROVIDER=supertokens

# Self-hosted SuperTokens Core
SUPERTOKENS_CONNECTION_URI=http://localhost:3567

# Or managed SuperTokens
SUPERTOKENS_CONNECTION_URI=https://try.supertokens.com
SUPERTOKENS_API_KEY=your-api-key

# App configuration
API_DOMAIN=http://localhost:4000
WEBSITE_DOMAIN=http://localhost:3000
```

---

## 📝 Recommendations

### Immediate Fixes (🔴 High Priority)

#### 1. Fix Hardcoded org_id in Local Adapter

**Current Code** (local.ts:30-36):
```typescript
return {
  user: {
    id: decoded.sub,
    email: decoded.email,
    name: decoded.name || decoded.email,
    org_id: 'dummy-org-id' // ← Remove this
  }
};
```

**Fixed Code**:
```typescript
async authenticate(req: ExpressRequest, res: ExpressResponse): Promise<AuthContext> {
  const token = this.extractToken(req);
  if (!token) {
    throw new Error('No token found');
  }

  try {
    const decoded = jwt.verify(token, this.JWT_SECRET) as {
      sub: string;
      email: string;
      name?: string;
      org_id?: string;  // Add org_id to JWT
      iat: number;
      exp: number;
    };

    // If org_id not in token, adapter only verifies token
    // Middleware will fetch org_id from database
    return {
      user: {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name || decoded.email,
        org_id: decoded.org_id || '', // Empty string, will be filled by middleware
      }
    };
  } catch (error) {
    logger.error('Token verification failed', { error });
    throw new Error('Invalid token');
  }
}
```

**Update Middleware** (middleware.ts:53-87):
```typescript
try {
  const authContext = await authAdapter.authenticate(req, res);

  // Get the user from our database (THIS ALREADY EXISTS - GOOD!)
  const user = await prisma.user.findUnique({
    where: { external_id: authContext.user?.id },
    select: {
      id: true,
      email: true,
      org_id: true,
      name: true,
    }
  });

  if (!user || !user.org_id) {
    logger.warn('User not found (or with no org)', { userId: authContext.user?.id });
    return res.status(401).json({ error: 'User not authenticated' });
  }

  // Use database user info (org_id from DB, not dummy value) ← Already correct!
  const context: AuthContext = {
    user: {
      id: user.id,
      email: user.email,
      org_id: user.org_id,  // ← From database ✅
      name: user.name
    },
    permissions
  };
```

**Why This Works**:
- ✅ Adapter only verifies token validity
- ✅ Middleware fetches actual org_id from database
- ✅ No hardcoded values
- ✅ Multi-tenancy preserved

#### 2. Standardize JWT Claims

**Update Login** (routes.ts:44-53):
```typescript
// Generate JWT token
const token = jwt.sign(
  {
    sub: user.external_id,  // ✅ Already correct
    email: user.email,
    name: user.name,
    org_id: user.org_id,    // ← Add org_id
    roles: user.role_users.map(ur => ur.role.name)
  },
  JWT_SECRET,
  { expiresIn: '24h' }
);
```

**Update Register** (routes.ts:104-111):
```typescript
// Generate JWT token
const token = jwt.sign(
  {
    sub: user.external_id,  // ← Change from 'id' to 'sub'
    email: user.email,
    name: user.name,
    org_id: user.org_id,    // ← Add org_id
  },
  JWT_SECRET,
  { expiresIn: '24h' }
);
```

#### 3. Add Proper Error Handling

**Update Middleware** (middleware.ts:97-105):
```typescript
} catch (error) {
  logger.error('Authentication failed', {
    error: error instanceof Error ? error.message : error,
    path: req.path,
    method: req.method
  });

  // For protected routes, return 401
  // For public routes (like GraphQL introspection), allow through
  if (req.path.startsWith('/api/') && !req.path.startsWith('/api/auth/')) {
    return res.status(401).json({
      error: 'Authentication required',
      message: error instanceof Error ? error.message : 'Invalid token'
    });
  }

  // For GraphQL, let it through (GraphQL will handle auth per resolver)
  (req as any).context = { auth: null };
}
next();
```

### Short-Term Improvements (🟡 Medium Priority)

#### 4. Add Logout Endpoint

```typescript
// routes.ts - Add logout endpoint
authRouter.post('/logout', (req, res) => {
  // For JWT, we can't invalidate tokens server-side
  // But we can add to a blacklist or rely on client-side deletion

  // Option 1: Token blacklist (requires Redis/database)
  // await blacklistToken(token);

  // Option 2: Client-side only (less secure)
  res.json({
    message: 'Logged out successfully',
    note: 'Please delete the token from client storage'
  });
});
```

#### 5. Add Refresh Token Support

```typescript
// types.ts
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// routes.ts - Update login to return refresh token
authRouter.post('/login', async (req, res) => {
  // ... existing validation ...

  // Generate access token (short-lived)
  const accessToken = jwt.sign(
    { sub: user.external_id, email, name, org_id, roles },
    JWT_SECRET,
    { expiresIn: '15m' }  // ← Short expiry
  );

  // Generate refresh token (long-lived)
  const refreshToken = jwt.sign(
    { sub: user.external_id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }  // ← Longer expiry
  );

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      user_id: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  res.json({
    user: { id, name, email, roles },
    accessToken,
    refreshToken
  });
});

// Add refresh endpoint
authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Check if refresh token exists in database
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        user_id: decoded.sub,
        expires_at: { gte: new Date() }
      }
    });

    if (!storedToken) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { role_users: { include: { role: true } } }
    });

    // Generate new access token
    const accessToken = jwt.sign(
      { sub: user.external_id, email: user.email, name: user.name,
        org_id: user.org_id, roles: user.role_users.map(ur => ur.role.name) },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ accessToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});
```

#### 6. Add Password Reset Flow

```typescript
// routes.ts
import crypto from 'crypto';

// Request password reset
authRouter.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Don't reveal if email exists
    return res.json({ message: 'If email exists, reset link sent' });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

  await prisma.passwordResetToken.create({
    data: {
      token: resetToken,
      user_id: user.id,
      expires_at: resetTokenExpiry
    }
  });

  // TODO: Send email with reset link
  // await sendEmail(user.email, resetToken);

  res.json({ message: 'If email exists, reset link sent' });
});

// Reset password
authRouter.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      token,
      expires_at: { gte: new Date() },
      used_at: null
    }
  });

  if (!resetToken) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update password
  await prisma.user.update({
    where: { id: resetToken.user_id },
    data: { password: hashedPassword }
  });

  // Mark token as used
  await prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { used_at: new Date() }
  });

  res.json({ message: 'Password reset successfully' });
});
```

#### 7. Add Rate Limiting

```bash
npm install express-rate-limit
```

```typescript
// middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to auth routes
authRouter.post('/login', authLimiter, async (req, res) => {
  // ... login logic
});
```

### Long-Term Improvements (🟢 Low Priority)

#### 8. Add Email Verification

#### 9. Add MFA Support

#### 10. Add OAuth/Social Login

#### 11. Add Account Linking

---

## 🔄 Migration Guide

### Development → Production with SuperTokens

#### Phase 1: Setup SuperTokens Core (Self-Hosted)

```bash
# Using Docker
docker run -d \
  -p 3567:3567 \
  --name supertokens \
  registry.supertokens.io/supertokens/supertokens-postgresql

# Or using Docker Compose
version: '3'
services:
  supertokens:
    image: registry.supertokens.io/supertokens/supertokens-postgresql
    ports:
      - "3567:3567"
    environment:
      POSTGRESQL_CONNECTION_URI: "postgresql://user:pass@db:5432/supertokens"
```

#### Phase 2: Migrate Existing Users

```typescript
// migration script
import SuperTokens from 'supertokens-node';
import EmailPassword from 'supertokens-node/recipe/emailpassword';

async function migrateUsers() {
  const users = await prisma.user.findMany({
    where: { auth_provider: 'local' }
  });

  for (const user of users) {
    try {
      // Create user in SuperTokens
      const stUser = await EmailPassword.signUp(
        user.email,
        user.password  // Already hashed with bcrypt
      );

      // Update user record
      await prisma.user.update({
        where: { id: user.id },
        data: {
          external_id: stUser.user.id,
          auth_provider: 'supertokens'
        }
      });

      console.log(`Migrated user: ${user.email}`);
    } catch (error) {
      console.error(`Failed to migrate user ${user.email}:`, error);
    }
  }
}
```

#### Phase 3: Switch Provider

```bash
# Update .env
AUTH_PROVIDER=supertokens
SUPERTOKENS_CONNECTION_URI=http://localhost:3567
```

#### Phase 4: Update Frontend

```typescript
// Install SuperTokens frontend SDK
npm install supertokens-auth-react

// Configure in your React app
import SuperTokens from 'supertokens-auth-react';
import EmailPassword from 'supertokens-auth-react/recipe/emailpassword';
import Session from 'supertokens-auth-react/recipe/session';

SuperTokens.init({
  appInfo: {
    appName: 'Fabriq',
    apiDomain: 'http://localhost:4000',
    websiteDomain: 'http://localhost:3000',
    apiBasePath: '/api/auth',
    websiteBasePath: '/auth',
  },
  recipeList: [
    EmailPassword.init(),
    Session.init(),
  ],
});
```

---

## 🔒 Security Best Practices

### 1. JWT Secret Management

```bash
# Generate strong secret
openssl rand -base64 64

# Store securely
# ❌ Don't commit to git
# ✅ Use environment variables
# ✅ Use secret management (AWS Secrets Manager, Vault)
```

### 2. Token Storage

**Client-Side**:
- ❌ localStorage (vulnerable to XSS)
- ✅ HttpOnly cookies (protected from XSS)
- ✅ Secure flag in production (HTTPS only)
- ✅ SameSite=Lax or Strict

### 3. Password Security

```typescript
// Use bcrypt with appropriate rounds
const hashedPassword = await bcrypt.hash(password, 12);  // 12 rounds

// Validate password strength
function validatePassword(password: string): boolean {
  return password.length >= 8 &&
         /[A-Z]/.test(password) &&
         /[a-z]/.test(password) &&
         /[0-9]/.test(password) &&
         /[^A-Za-z0-9]/.test(password);
}
```

### 4. HTTPS in Production

```typescript
// Force HTTPS
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
    res.redirect(`https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});
```

### 5. CORS Configuration

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.FRONTEND_URL,  // Specific origin
  credentials: true,  // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 6. Audit Logging

```typescript
// Log all authentication attempts
logger.info('Login attempt', {
  email: email,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  success: true/false,
  timestamp: new Date()
});
```

---

## 📋 Testing Checklist

### Unit Tests

- [ ] Local adapter token verification
- [ ] Clerk adapter token verification
- [ ] SuperTokens adapter session validation
- [ ] Middleware context creation
- [ ] Permission loading
- [ ] Error handling

### Integration Tests

- [ ] Login flow (200 OK)
- [ ] Login with invalid credentials (401)
- [ ] Register new user (201 Created)
- [ ] Register duplicate email (400)
- [ ] Authenticated request with valid token (200)
- [ ] Authenticated request with invalid token (401)
- [ ] Authenticated request without token (401)
- [ ] Token expiration handling (401)
- [ ] Refresh token flow (200)
- [ ] Password reset flow (200)

### Security Tests

- [ ] SQL injection in login
- [ ] XSS in user input
- [ ] Rate limiting works
- [ ] CORS configured correctly
- [ ] HTTPS redirect in production
- [ ] Secure cookies set correctly
- [ ] Token expiration enforced

---

## 🎯 Summary

### Current State
- ✅ Local JWT adapter working
- ✅ Clerk adapter working
- ✅ Factory pattern implemented
- ✅ Permission integration complete
- ⚠️ Minor bugs need fixing
- ❌ Missing session management
- ❌ Missing refresh tokens
- ❌ No password reset
- ❌ SuperTokens not yet implemented

### Recommended Path Forward

**Immediate** (Week 1):
1. Fix hardcoded org_id in local adapter
2. Standardize JWT claims (use 'sub' consistently)
3. Improve error handling in middleware
4. Add input validation

**Short-Term** (Week 2-3):
1. Add logout endpoint
2. Implement refresh token support
3. Add password reset flow
4. Add rate limiting
5. Improve logging

**Production** (Month 2):
1. Implement SuperTokens adapter
2. Set up self-hosted SuperTokens Core
3. Migrate existing users
4. Update frontend to use SuperTokens SDK
5. Deploy with proper secrets management
6. Enable MFA

---

**End of Authentication Guide**

For deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)
For architecture details, see [CLAUDE.md](./CLAUDE.md)
