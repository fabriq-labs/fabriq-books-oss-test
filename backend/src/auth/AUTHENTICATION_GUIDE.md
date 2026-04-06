# Authentication Guide - Internal Auth Provider

This guide explains how to use the internal authentication provider in the Fabriq Base system.

## 🔧 Configuration

### Environment Variables

Set these in your `.env` file:

```bash
# Use internal authentication
AUTH_PROVIDER=local

# JWT secret for token signing (optional, defaults to 'test-secret-key')
JWT_SECRET=your-secure-jwt-secret-key

# Database URL
DATABASE_URL=your-postgresql-connection-string
```

## 🏗️ Authentication Architecture

The system uses a **single user model** approach:

1. **`user`** (metadata.prisma) - Stores all user data including login credentials, metadata, roles, and organization relationships

### Key Components

- **Auth Middleware** (`src/auth/middleware.ts`) - Handles request authentication
- **Local Auth Adapter** (`src/auth/adapters/local.ts`) - JWT-based internal authentication
- **Auth Routes** (`src/auth/routes.ts`) - Login/register endpoints
- **Permission Service** - Role-based access control

## 🚀 Setup Development Users

Run the setup script to create test users with passwords:

```bash
npm run setup-dev
```

This creates:
- **Bruce Wayne** (bruce.wayne@wayneenterprises.com) - Admin
- **Lucius Fox** (lucius.fox@wayneenterprises.com) - Manager  
- **Alfred Pennyworth** (alfred.pennyworth@wayneenterprises.com) - User

**Default password for all users: `password`**

## 🔐 Authentication Flow

### 1. Login Process

**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "email": "bruce.wayne@wayneenterprises.com",
  "password": "password"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_bruce_wayne",
    "name": "Bruce Wayne",
    "email": "bruce.wayne@wayneenterprises.com",
    "roles": ["Administrator"]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. Using the Token

Include the JWT token in the `Authorization` header:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Making Authenticated Requests

**GraphQL:**
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"query": "query { users { id name email } }"}'
```

**REST API:**
```bash
curl -X GET http://localhost:4000/api/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🛠️ Manual Testing Examples

### Test Login with cURL

```bash
# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bruce.wayne@wayneenterprises.com",
    "password": "password"
  }'

# Use the returned token
curl -X GET http://localhost:4000/api/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Test with Postman

1. **Login Request:**
   - Method: `POST`
   - URL: `http://localhost:4000/api/auth/login`
   - Body (JSON):
     ```json
     {
       "email": "bruce.wayne@wayneenterprises.com",
       "password": "password"
     }
     ```

2. **Authenticated Request:**
   - Method: `GET`
   - URL: `http://localhost:4000/api/users`
   - Headers: `Authorization: Bearer YOUR_TOKEN`

### Test with JavaScript/Frontend

```javascript
// Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'bruce.wayne@wayneenterprises.com',
    password: 'password'
  })
});

const { token, user } = await loginResponse.json();

// Use token for authenticated requests
const usersResponse = await fetch('/api/users', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const users = await usersResponse.json();
```

## 🔍 Troubleshooting

### Common Issues

1. **"User not found" Error**
   - Ensure user exists in the `user` table
   - Check that `external_id` field is properly set (usually matches email)

2. **"Invalid token" Error**
   - Verify JWT_SECRET matches between login and verification
   - Check token expiration (default: 24 hours)

3. **"User not found (or with no org)" Error**
   - Ensure user has `org_id` set in the `user` table
   - Verify organization exists in the database

### Debug Authentication

Enable debug logging by setting:
```bash
LOG_LEVEL=debug
```

Check logs for:
- Token extraction and verification
- User lookup in database
- Permission fetching

## 🔒 Security Considerations

1. **Password Hashing**: Uses bcrypt with salt rounds
2. **JWT Expiration**: Tokens expire in 24 hours
3. **Secret Key**: Use a strong, random JWT_SECRET in production
4. **HTTPS**: Always use HTTPS in production
5. **Token Storage**: Store tokens securely (not in localStorage for sensitive apps)

## 📝 Database Schema Notes

### User Model (metadata.prisma)
```prisma
model user {
  id            String   @id @default(dbgenerated("'user_' || gen_random_uuid()"))
  email         String   @unique
  name          String?
  password      String?  // For internal auth provider (bcrypt hashed)
  external_id   String   @unique @map("auth_id") // For external auth systems
  auth_provider String?  // 'local', 'clerk', etc.
  created_at    DateTime @default(now())
  modified_at   DateTime @updatedAt
  created_by    String?  // Reference to user.id
  modified_by   String?  // Reference to user.id
  org_id        String?
  manager_id    String?  // Reference to manager's user id
  department_id String?
  
  // Relations
  org           org?     @relation("UserOrg", fields: [org_id], references: [id])
  manager       user?    @relation("ManagerReport", fields: [manager_id], references: [id])
  reports       user[]   @relation("ManagerReport")
  role_users    role_user[] @relation("UserToRoleUser")
  
  @@map("user")
}
```

**Key Fields:**
- `email`: Unique email address (used for login)
- `password`: bcrypt hashed password (for local auth)
- `external_id`: External identifier (usually email for local auth, Clerk ID for Clerk auth)
- `org_id`: Organization the user belongs to
- `auth_provider`: Authentication provider ('local', 'clerk', etc.)

## 🎯 Next Steps

1. **Test Login**: Use the provided test users
2. **Create Custom Users**: Add your own users to the `user` table
3. **Configure Roles**: Set up role-based permissions
4. **Frontend Integration**: Implement login forms in your frontend
5. **Production Setup**: Configure proper JWT secrets and HTTPS
