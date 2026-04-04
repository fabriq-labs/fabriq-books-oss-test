# Hasura Clone - Dynamic GraphQL API Generator

A TypeScript-based GraphQL API generator that automatically creates a fully functional CRUD API from your Prisma schema, similar to Hasura's functionality. This project automatically generates GraphQL types, queries, and mutations based on your Prisma schema definitions.

## Features

- 🚀 Automatic CRUD API generation from Prisma schema
- 📱 Dynamic type generation and relationship handling
- 🔒 Type-safe operations with TypeScript
- 🔄 Automatic timestamp handling (createdAt/updatedAt)
- 📊 Automatic relationship resolution
- 🎯 Custom scalar types support
- 🛠 Flexible schema customization
- 🔐 Role-based access control (RBAC)
- 🔑 JWT-based authentication
- 👥 Fine-grained field-level permissions
- 🎭 Role-based views and permissions
- 🌐 **Generic REST API support** (newly added)
- 📄 **AI-Powered Document Extraction** (newly added)

## Generic REST API

The project also provides a generic REST API that allows you to perform CRUD operations on your models. This API is built on top of the same principles as the GraphQL API, ensuring consistency in authentication and authorization.

### Endpoints

- **GET /api/{modelName}**: Fetch all records of a specific model.
- **GET /api/{modelName}/{id}**: Fetch a single record by ID.
- **POST /api/{modelName}**: Create a new record.
- **PUT /api/{modelName}/{id}**: Update an existing record by ID.
- **DELETE /api/{modelName}/{id}**: Delete a record by ID.

### Example Usage

#### Fetch All Users
```bash
curl -X GET http://localhost:3000/api/user
```

#### Fetch User by ID
```bash
curl -X GET http://localhost:3000/api/user/{userId}
```

#### Create a New User
```bash
curl -X POST http://localhost:3000/api/user \
-H "Content-Type: application/json" \
-d '{"name": "John Doe", "email": "john@example.com"}'
```

#### Update a User
```bash
curl -X PUT http://localhost:3000/api/user/{userId} \
-H "Content-Type: application/json" \
-d '{"name": "John Smith"}'
```

#### Delete a User
```bash
curl -X DELETE http://localhost:3000/api/user/{userId}
```

### Authentication

The REST API requires JWT-based authentication. Include the JWT token in the `Authorization` header for all requests:

```bash
-H "Authorization: Bearer your_jwt_token"
```

### Managing Relations

The system provides a unified way to manage both one-to-many and many-to-many (junction table) relationships. All operations are performed in the context of the parent model to ensure proper permission checking.

#### Permission Context
- All operations (create/delete) are performed in the context of the parent model
- The `authMiddleware` validates permissions based on the parent model
- This ensures users can only modify relationships for models they have access to

#### Endpoints for Managing Relations

1. **Adding a Relationship**
```
POST /api/{parentModel}/{parentId}/{relation}
```
Example: Adding a role to a user (requires user model permissions)
```bash
curl -X POST http://localhost:3000/api/user/{userId}/role_users \
-H "Content-Type: application/json" \
-H "Authorization: Bearer your_jwt_token" \
-d '{
  "children": [
    { "role_id": "role-id-123" }
  ]
}'
```

2. **Removing a Relationship**
```
DELETE /api/{parentModel}/{parentId}/{relation}/{childId}
```
Example: Removing a role from a user (requires user model permissions)
```bash
curl -X DELETE http://localhost:3000/api/user/{userId}/role_users/{roleId} \
-H "Authorization: Bearer your_jwt_token"
```

#### Example Use Cases

1. **One-to-Many Relationships**
```typescript
// Add a permission to a view (requires view model permissions)
await api.post(`/view/${viewId}/permissions`, {
  children: [{ field_name: "email", access: "read" }]
});

// Remove a permission from a view (requires view model permissions)
await api.delete(`/view/${viewId}/permissions/${permissionId}`);
```

2. **Many-to-Many Relationships (Junction Tables)**
```typescript
// Add a role to a user (requires user model permissions)
await api.post(`/user/${userId}/role_users`, {
  children: [{ role_id: roleId }]
});

// Remove a role from a user (requires user model permissions)
await api.delete(`/user/${userId}/role_users/${roleId}`);
```

3. **Any Relationship Type**
```typescript
// Add a relationship (requires parent model permissions)
await api.post(`/parent/${parentId}/relation_name`, {
  children: [{ child_id: childId }]
});

// Remove a relationship (requires parent model permissions)
await api.delete(`/parent/${parentId}/relation_name/${childId}`);
```

#### Permission Flow
1. Request comes in with JWT token
2. `authMiddleware` extracts user and permissions
3. System checks if user has permissions for the parent model
4. If authorized, operation proceeds
5. If not authorized, request is rejected

The system automatically handles:
- Permission validation in the context of the parent model
- Creation of junction records with proper authorization
- Validation of relationships
- Proper cleanup when relationships are removed

## AI-Powered Document Extraction

The system includes a sophisticated document extraction framework that uses AI to parse PDF documents and extract structured data mapped to your database models. This feature enables automatic data import from various document types.

### Quick Overview

- 🤖 **AI-Powered Extraction**: Uses Google's Gemini AI for intelligent document parsing
- 📄 **PDF Support**: Direct PDF processing without text extraction
- 🎯 **Model-Specific Extraction**: Each extractor maps to a specific database model
- 🔄 **1:1 Mapping**: Clean architecture with one extractor per model
- 🛡️ **Permission Integration**: Full integration with existing RBAC system
- 📊 **Structured Output**: Returns data ready for database insertion

### API Endpoint

**POST** `/api/parse-document/:modelName`

Upload and parse a PDF document for a specific model.

```bash
curl -X POST \
  "https://api.example.com/api/parse-document/posting" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@bank-statement.pdf"
```

### Supported Models

| Model | Extractor | Document Types | Description |
|-------|-----------|----------------|-------------|
| `posting` | `BankStatementExtractor` | `bank_statement`, `account_statement`, `credit_card_statement` | Extracts transaction data from bank statements |
| `invoice` | `InvoiceExtractor` | `invoice`, `bill` | Extracts invoice data (planned) |
| `expense_report` | `ReceiptExtractor` | `receipt`, `expense` | Extracts expense data from receipts (planned) |

### API Reference

#### Parse PDF Document

**Endpoint:** `POST /api/parse-document/:modelName`

**Description:** Upload a PDF document and extract structured data mapped to the specified model schema.

**Parameters:**
- `modelName` (path parameter): The target model name (e.g., "posting", "account", "invoice")

**Query Parameters:**
- `documentType` (optional): Override auto-detection of document type
- `view` (optional): View name for permissions

**Request Body:**
- Content-Type: `multipart/form-data`
- Field: `file` - PDF file to parse
- Max file size: 10MB
- Supported formats: PDF only

**Example Request:**
```bash
curl -X POST \
  "https://api.example.com/api/parse-document/posting?view=default" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@bank-statement.pdf"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "NEFT-HDFCN52025092693558514-ADITYA BIRLA FINANCE",
      "account_name": "611901080478",
      "value_date": "2025-09-26",
      "posting_date": "2025-09-26",
      "amount": 1,
      "posting_type": "CREDIT",
      "notes": "NEFT-HDFCN52025092693558514-ADITYA BIRLA FINANCE",
      "description": "NEFT-HDFCN52025092693558514-ADITYA BIRLA FINANCE",
      "currency": "INR"
    }
  ],
  "metaData": {
    "originalExtraction": { /* full extraction data */ },
    "confidence": 60,
    "documentType": "bank_statement",
    "modelName": "posting",
    "processingTime": 6470,
    "fileName": "bank-statement.pdf",
    "fileSize": 164963,
    "uploadedAt": "2025-10-08T17:32:59.823Z"
  },
  "error": undefined
}
```

**Error Responses:**
- `400 Bad Request`: Invalid file type, file too large, or missing file
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Model not found
- `500 Internal Server Error`: Processing failed

### Frontend Integration Examples

#### React/JavaScript Example

```javascript
// Parse PDF as posting records
const parsePDFAsPosting = async (file, token) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/parse-document/posting', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('Extracted postings:', result.data);
    console.log('Confidence:', result.metaData.confidence);
    return result.data;
  } else {
    throw new Error(result.error);
  }
};

// Parse PDF as account record
const parsePDFAsAccount = async (file, token) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/parse-document/account', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('Extracted account:', result.data);
    return result.data;
  } else {
    throw new Error(result.error);
  }
};
```

#### Vue.js Example

```javascript
// Vue component method
async parseDocument(file, modelName) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.$http.post(
      `/api/parse-document/${modelName}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${this.$store.state.auth.token}`
        }
      }
    );

    if (response.data.success) {
      this.extractedData = response.data.data;
      this.confidence = response.data.metaData.confidence;
      this.showSuccessMessage('Document parsed successfully!');
    } else {
      this.showErrorMessage(response.data.error);
    }
  } catch (error) {
    this.showErrorMessage('Failed to parse document');
    console.error('Parse error:', error);
  }
}
```

### Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "data": null,
  "metaData": null,
  "error": "Error message describing what went wrong"
}
```

Common error scenarios:
- **File validation errors**: Invalid file type, file too large
- **Authentication errors**: Missing or invalid token
- **Permission errors**: Insufficient access to model
- **Processing errors**: LLM processing failed, document unreadable
- **Model errors**: Model not found, no extractor mapping

### Performance Considerations

- **Processing time**: Typically 6-8 seconds for bank statements
- **File size limit**: 10MB maximum
- **Confidence scores**: Range from 0-100%, typically 60-80% for well-formatted documents
- **Rate limiting**: Consider implementing rate limiting for production use

### Security Notes

- All endpoints require authentication
- File uploads are validated for type and size
- User permissions are checked for model access
- Sensitive data is logged appropriately
- Consider implementing additional security measures for production use

### Documentation

For comprehensive documentation including:
- Architecture details and core components
- Extension guide for new extractors
- Configuration and setup instructions
- Technical implementation details and direct library usage

See: [`src/lib/extractors/README.md`](src/lib/extractors/README.md)

## API Differences: GraphQL vs REST

While both APIs provide access to the same data, they handle relations differently:

### GraphQL API
- Junction tables are hidden from the API
- Relations can only be queried, not created/updated through parent models
- No direct CRUD operations on junction tables
- Example:
```graphql
# Query a user with their roles
query {
  user(id: "user-id") {
    id
    name
    roles {
      id
      name
    }
  }
}

# Note: To create/update relations, you must use the REST API
```

#### GraphQL Query Capabilities

1. **One-to-Many Relations**
```graphql
# Query a view with its permissions
query {
  view(id: "view-id") {
    id
    name
    permissions {
      id
      field_name
      access
    }
  }
}

# Query all views with their permissions
query {
  allViews {
    id
    name
    permissions {
      id
      field_name
      access
    }
  }
}
```

2. **Many-to-Many Relations**
```graphql
# Query a role with its views and users
query {
  role(id: "role-id") {
    id
    name
    views {
      id
      name
      model
    }
    users {
      id
      name
      email
    }
  }
}

# Query a user with their roles and permissions
query {
  user(id: "user-id") {
    id
    name
    roles {
      id
      name
      views {
        id
        name
        permissions {
          id
          field_name
          access
        }
      }
    }
  }
}
```

3. **Nested Relations**
```graphql
# Deep nested query: User -> Roles -> Views -> Permissions
query {
  user(id: "user-id") {
    id
    name
    roles {
      id
      name
      views {
        id
        name
        model
        permissions {
          id
          field_name
          access
        }
      }
    }
  }
}

# Query with selective fields at each level
query {
  allUsers {
    id
    name
    roles {
      id
      name
      views {
        id
        name
        permissions {
          field_name
          access
        }
      }
    }
  }
}
```

4. **Filtering and Pagination**
```graphql
# Query users with specific roles
query {
  allUsers {
    id
    name
    roles(where: { name: { contains: "admin" } }) {
      id
      name
    }
  }
}

# Paginated query with relations
query {
  allUsers(skip: 0, take: 10) {
    id
    name
    roles {
      id
      name
    }
  }
}
```

#### Key Features of GraphQL Queries
- **Type Safety**: All queries are type-checked against the schema
- **Selective Loading**: Only requested fields are loaded from the database
- **Nested Relations**: Deep nesting of related data in a single query
- **Permission Handling**: Automatic permission checking for all fields
- **Efficient Loading**: Optimized database queries with proper joins

### REST API
- Provides direct endpoints for managing relations
- Uses a unified pattern for both one-to-many and many-to-many
- Allows explicit creation/deletion of relations
- Example:
```bash
# Add a role to a user (direct relation endpoint)
curl -X POST http://localhost:3000/api/user/{userId}/role_users \
-H "Content-Type: application/json" \
-H "Authorization: Bearer your_jwt_token" \
-d '{
  "children": [
    { "role_id": "role-id-123" }
  ]
}'
```

### Choosing Between APIs
- Use GraphQL when you need:
  - Complex nested queries
  - Type safety
  - Automatic permission handling
  - Querying related data

- Use REST when you need:
  - Creating/updating relations
  - Direct control over relations
  - Simpler integration
  - Standard HTTP operations

## Project Structure

```
src/
├── models/
│   └── ModelRegistry.ts     # Entity and type management
├── schema/
│   └── SchemaBuilder.ts     # GraphQL schema generation
├── utils/
│   └── PrismaSchemaParser.ts # Prisma schema parsing
├── auth/
│   ├── middleware.ts        # Authentication middleware
│   └── types.ts            # Auth-related type definitions
├── lib/
│   ├── prisma.ts           # Prisma client initialization
│   ├── llm.ts              # AI/LLM service integration
│   └── extractors/         # Document extraction framework
│       ├── types.ts        # Extractor interfaces and types
│       ├── base-extractor.ts # Abstract base extractor class
│       ├── bank-statement-extractor.ts # Bank statement extractor
│       ├── extractor-registry.ts # Extractor management
│       └── extractors.ts   # Main extractor entry point
├── services/
│   ├── core/
│   │   └── ModelService.ts  # Core model operations + document parsing
│   ├── dal/
│   │   └── DataAccessLayer.ts # Data access layer
│   ├── permissions/
│   │   └── PermissionService.ts # Permission management
│   └── query/
│       └── SearchQueryBuilder.ts # Query building utilities
├── rest/
│   ├── RestService.ts       # REST API service
│   ├── routes.ts           # Route configuration
│   └── PDF_PARSING_API.md  # Document extraction API docs
└── index.ts                # Application entry point
```

## Authentication & Authorization

The system implements a comprehensive authentication and authorization system:

### Authentication
- JWT-based authentication
- Automatic token validation
- Secure token handling
- User context management

### Authorization
- Role-based access control (RBAC)
- Field-level permissions
- Model-level access control
- Permission inheritance through roles

### Permission Types
- `read`: Allows reading field values
- `write`: Allows modifying field values
- `none`: Denies access to field values

### Example Permission Structure
```typescript
{
  "user": {
    "id": "read",
    "name": "write",
    "email": "read"
  }
}
```

## Core Components

### 1. PrismaSchemaParser

Automatically reads and parses your Prisma schema file to generate entity definitions.

```typescript
const schemaParser = new PrismaSchemaParser();
const entities = schemaParser.parseModels();
```

Features:
- Parses Prisma models into EntityDefinitions
- Handles relationships and field types
- Supports default values and constraints
- Maps Prisma types to GraphQL types

### 2. ModelRegistry

Manages entity definitions and GraphQL types as a singleton.

```typescript
const modelRegistry = ModelRegistry.getInstance();
modelRegistry.registerEntity({
  name: 'User',
  fields: [...],
  relationships: [...]
});
```

Features:
- Singleton pattern for consistent state
- Manages entity definitions
- Creates and caches GraphQL types
- Handles relationship mappings

### 3. SchemaBuilder

Generates the complete GraphQL schema with queries and mutations.

```typescript
const schemaBuilder = new SchemaBuilder();
const schema = schemaBuilder.buildSchema();
```

Generated Operations:
- Queries:
  - `allUsers`: Fetch all users
  - `user(id: ID!)`: Fetch user by ID
- Mutations:
  - `createUser(input: UserCreateInput!)`: Create user
  - `updateUser(id: ID!, input: UserUpdateInput!)`: Update user
  - `deleteUser(id: ID!)`: Delete user

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up your PostgreSQL database and update `.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
JWT_SECRET="your-secret-key"

# AI Document Extraction (Optional)
GOOGLE_CLOUD_PROJECT_ID="your-project-id"
GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64="base64-encoded-service-account-key"
```

3. Initialize Prisma:
```bash
npx prisma generate
npx prisma migrate dev
```

4. Start the development server:
```bash
npm run dev
```

## Example Usage

### 1. Define Your Schema

```prisma
// prisma/schema.prisma
model User {
  id        String   @id @default(uuid())
  name      String
  email     String   @unique
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(uuid())
  title     String
  content   String
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Role {
  id    String   @id @default(uuid())
  name  String   @unique
  views View[]
}

model View {
  id        String   @id @default(uuid())
  name      String
  model     String
  role      Role     @relation(fields: [roleId], references: [id])
  roleId    String
  fields    FieldPermission[]
}

model FieldPermission {
  id        String   @id @default(uuid())
  fieldName String
  access    String   // 'read' | 'write' | 'none'
  view      View     @relation(fields: [viewId], references: [id])
  viewId    String
}

model UserRole {
  id     String @id @default(uuid())
  user   User   @relation(fields: [userId], references: [id])
  userId String
  role   Role   @relation(fields: [roleId], references: [id])
  roleId String
}
```

### 2. Query Examples

Fetch all users with their posts (requires authentication):
```graphql
query {
  allUsers {
    id
    name
    email
    posts {
      id
      title
      content
    }
    createdAt
    updatedAt
  }
}
```

Create a new user (requires authentication and write permissions):
```graphql
mutation {
  createUser(input: {
    name: "John Doe"
    email: "john@example.com"
  }) {
    id
    name
    createdAt
  }
}
```

Update a user (requires authentication and write permissions):
```graphql
mutation {
  updateUser(
    id: "user-id"
    input: {
      name: "John Smith"
    }
  ) {
    id
    name
    updatedAt
  }
}
```

## Authentication Flow

1. Client sends a request with a JWT token in the Authorization header
2. Server validates the token and extracts user information
3. Server fetches user roles and permissions
4. Server applies field-level permissions to the request
5. Request is processed with the appropriate access controls

## Type Definitions

### Entity Definition
```typescript
interface EntityDefinition {
  name: string;
  fields: FieldDefinition[];
  relationships?: RelationshipDefinition[];
}
```

### Field Definition
```typescript
interface FieldDefinition {
  name: string;
  type: 'string' | 'int' | 'float' | 'boolean' | 'id' | 'datetime';
  isRequired?: boolean;
  isUnique?: boolean;
  defaultValue?: any;
}
```

### Relationship Definition
```typescript
interface RelationshipDefinition {
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  target: string;
  field: string;
  foreignKey?: string;
}
```

## Development

### Scripts

- `npm run dev`: Start development server with hot reload
- `npm run build`: Build the project
- `npm start`: Start the production server
- `npm test`: Run tests
- `npm run prisma:generate`: Generate Prisma client
- `npm run prisma:migrate`: Run database migrations

### Dependencies

- `@apollo/server`: GraphQL server
- `@prisma/client`: Database ORM
- `express`: Web server
- `graphql`: GraphQL implementation
- `graphql-scalars`: Custom GraphQL scalars
- `reflect-metadata`: Metadata reflection
- `jsonwebtoken`: JWT handling
- `bcrypt`: Password hashing
- `@google-cloud/vertexai`: Google Cloud Vertex AI integration
- `multer`: File upload handling
- `dotenv`: Environment variable management
