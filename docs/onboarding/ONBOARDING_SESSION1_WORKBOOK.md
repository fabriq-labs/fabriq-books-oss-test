# Session 1: IDE Setup & Environment Configuration

**Duration**: 2 hours  
**Objective**: Set up your development environment with Cursor IDE, clone the **monorepo**, configure environment variables, and verify everything works.

---

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Node.js** installed (v18 or higher)
  - Check: `node --version`
  - If not installed: Download from [nodejs.org](https://nodejs.org/)
  
- [ ] **PostgreSQL** installed (v14 or higher)
  - Check: `psql --version`
  - If not installed:
    - macOS: `brew install postgresql@15`
    - Ubuntu: `sudo apt-get install postgresql`
    - Windows: Download from [postgresql.org](https://www.postgresql.org/download/)
  
- [ ] **Git** installed
  - Check: `git --version`
  - If not installed: Download from [git-scm.com](https://git-scm.com/)
  
- [ ] **Cursor IDE** installed
  - Download from [cursor.sh](https://cursor.sh/)
  - Install and launch Cursor
  
- [ ] **Access to the monorepo**
  - Application repository (backend + frontend + docs in one tree): `https://github.com/fabriq-labs/fabriq-ws-setup` (or your fork/org URL)
  
- [ ] **Database credentials**
  - Database host: `_________________`
  - Database name: `_________________`
  - Database user: `_________________`
  - Database password: `_________________`

---

## Step 1: Clone the monorepo

**Time**: 5 minutes

### Instructions

1. Open Terminal (or Command Prompt on Windows)

2. Navigate to your preferred development directory:
   ```bash
   # Example: Create in home directory
   cd ~
   
   # Or create in a specific location
   cd ~/Documents
   ```

3. Create a new directory for the Fabriq workspace:
   ```bash
   mkdir fabriq-workspace
   cd fabriq-workspace
   ```

4. Clone the repository (includes `backend/`, `frontend-1/`, docs, and Docker assets):
   ```bash
   git clone https://github.com/fabriq-labs/fabriq-ws-setup fabriq
   cd fabriq
   ```

5. Verify you're in the right location and files are present:
   ```bash
   pwd  # macOS/Linux - should show path ending in fabriq
   ls -la  # Should show fabriq.code-workspace, docs/, README.md, etc.
   ```

**Expected Output**: 
- You should see the path to `fabriq-workspace/fabriq`
- You should see `fabriq.code-workspace` file
- You should see `docs/` directory

- [ ] Workspace directory created
- [ ] Workspace repository cloned
- [ ] Currently in `fabriq` directory
- [ ] `fabriq.code-workspace` file exists
- [ ] `docs/` directory exists

---

## Step 2: Verify `backend/` and `frontend-1/` (monorepo)

**Time**: 10 minutes

The clone in Step 1 should already include **`backend/`** and **`frontend-1/`**. If either folder is missing, you are not on the full monorepo checkout—re-clone or sync with your team.

### Instructions

1. From the repo root:
   ```bash
   ls backend/package.json frontend-1/package.json
   ```

2. Install backend dependencies:
   ```bash
   cd backend && npm install && cd ..
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend-1 && npm install && cd ..
   ```

**Troubleshooting**:
- If `npm install` fails, check Node.js: `node --version` (18+ recommended)
- If folders are missing, confirm you cloned the correct repository and branch

- [ ] `backend/` and `frontend-1/` exist with `package.json` in each
- [ ] Backend `npm install` completed without errors
- [ ] Frontend `npm install` completed without errors

---

## Step 3: Open Cursor IDE Workspace

**Time**: 5 minutes

### Instructions

1. **Open Cursor IDE**

2. **Open the Workspace File**:
   - In Cursor, go to: `File → Open Workspace from File...`
   - Navigate to `fabriq/fabriq.code-workspace`
   - Click "Open"
   
   **Alternatively**: Double-click `fabriq.code-workspace` in Finder/File Explorer

3. **Verify Workspace Setup**:
   - Check sidebar shows three folders:
     - ✅ **fabriq (Workspace Config)** - Root folder with docs and workspace config
     - ✅ **Backend** - Backend repository
     - ✅ **Frontend** - Frontend repository
   - You should be able to navigate between folders

4. **Verify Git**:
   - Open Source Control (Ctrl+Shift+G / Cmd+Shift+G)
   - You should see **one** repository (the monorepo root)

**Troubleshooting**:
- If folders don't appear, open the `.code-workspace` file, not only a single subfolder
- If TypeScript errors appear, wait for the editor to index (may take a minute)

- [ ] Cursor IDE opened
- [ ] Workspace file opened (`fabriq.code-workspace`)
- [ ] Root, backend, and frontend folders visible in sidebar
- [ ] Can navigate between folders
- [ ] Single git repository visible in Source Control

---

## Step 4: Configure Backend Environment

**Time**: 10 minutes

### Instructions

1. **Navigate to backend folder in Cursor**

2. **Copy environment template**:
   ```bash
   cd backend
   cp .env.example .env
   ```
   
   Or in Cursor:
   - Right-click `.env.example`
   - Select "Copy"
   - Right-click in same directory
   - Select "Paste"
   - Rename to `.env`

3. **Open `.env` file** in Cursor

4. **Configure Database Connection**:
   
   Find and update:
   ```bash
   DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/DATABASE_NAME"
   ```
   
   **Replace**:
   - `USERNAME` with your PostgreSQL username
   - `PASSWORD` with your PostgreSQL password
   - `DATABASE_NAME` with your database name (e.g., `fabriq_db`)
   - `localhost:5432` if your database is on a different host/port
   
   **Example**:
   ```bash
   DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/fabriq_db"
   ```

5. **Configure JWT Secret**:
   
   Find and update:
   ```bash
   JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
   ```
   
   **Generate a secure secret**:
   ```bash
   # In terminal, run:
   openssl rand -base64 32
   ```
   
   Copy the output and paste it as the JWT_SECRET value.

6. **Configure Port** (optional, defaults to 4000):
   ```bash
   PORT=4000
   ```

7. **Save the `.env` file**

8. **Verify `.env` file**:
   - Make sure `.env` is in `.gitignore` (it should be)
   - Never commit `.env` to git!

**Important**: 
- The `.env` file contains sensitive information
- Never share it or commit it to version control
- Keep it secure on your local machine

- [ ] `.env` file created from `.env.example`
- [ ] `DATABASE_URL` configured correctly
- [ ] `JWT_SECRET` set (32+ characters)
- [ ] `.env` file saved
- [ ] Verified `.env` is in `.gitignore`

---

## Step 5: Configure Frontend Environment

**Time**: 5 minutes

### Instructions

1. **Navigate to frontend-1 folder in Cursor**

2. **Copy environment template**:
   ```bash
   cd frontend-1
   cp .env.example .env.local
   ```
   
   Or in Cursor:
   - Right-click `.env.example`
   - Copy and paste, rename to `.env.local`

3. **Open `.env.local` file** in Cursor

4. **Configure API Base URL**:
   
   Find and update:
   ```bash
   VITE_API_BASE_URL=http://localhost:4000
   ```
   
   **This should point to your backend server URL**
   - For local development: `http://localhost:4000`
   - If backend is on different port, update accordingly

5. **Save the `.env.local` file**

6. **Verify `.env.local` file**:
   - Make sure `.env.local` is in `.gitignore`

- [ ] `.env.local` file created
- [ ] `VITE_API_BASE_URL` configured
- [ ] `.env.local` file saved

---

## Step 6: Set Up Database

**Time**: 15 minutes

### Instructions

1. **Ensure PostgreSQL is running**:
   ```bash
   # Check if PostgreSQL is running
   pg_isready
   ```
   
   **If not running**:
   - macOS: `brew services start postgresql@15`
   - Ubuntu: `sudo systemctl start postgresql`
   - Windows: Start PostgreSQL service from Services

2. **Create database** (if it doesn't exist):
   ```bash
   # Connect to PostgreSQL
   psql -U postgres
   
   # Create database
   CREATE DATABASE fabriq_db;
   
   # Exit psql
   \q
   ```
   
   **Replace `fabriq_db` with your database name if different**

3. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

4. **Run database setup script**:
   ```bash
   node setup-db.js --demo-data=indian-demo --skip-tests
   ```
   
   **This will**:
   - Validate Prisma schema
   - Reset database schema
   - Load metadata (roles, views, permissions)
   - Set up workflows
   - Load demo data
   
   **This may take 2-5 minutes. Wait for completion.**

5. **Verify setup completed successfully**:
   
   Look for output like:
   ```
   ✅ Schema validation passed
   ✅ Database schema reset complete
   ✅ Metadata setup complete
   ✅ Workflow setup complete
   ✅ Demo data loaded
   ✅ Setup complete!
   ```

**Troubleshooting**:
- **Connection error**: Check `DATABASE_URL` in `.env` is correct
- **Permission denied**: Ensure database user has CREATE privileges
- **Schema validation failed**: Check Prisma schema files for errors
- **Port already in use**: Change `PORT` in `.env` to a different value

- [ ] PostgreSQL is running
- [ ] Database created (or already exists)
- [ ] Database setup script completed successfully
- [ ] No errors in setup output

---

## Step 7: Verify Backend Setup

**Time**: 5 minutes

### Instructions

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Start backend server**:
   ```bash
   npm run dev
   ```
   
   **You should see output like**:
   ```
   Server running on http://localhost:4000
   GraphQL endpoint: http://localhost:4000/graphql
   ```

3. **Keep this terminal open** (backend needs to keep running)

4. **Test backend API** (in a new terminal):
   ```bash
   # Test health endpoint (if exists)
   curl http://localhost:4000/api/health
   
   # Or test login endpoint
   curl -X POST http://localhost:4000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@example.com", "password": "admin123"}'
   ```
   
   **Expected response**: JSON with user data and token

5. **If backend starts successfully**:
   - ✅ Backend is running
   - ✅ API is responding
   - ✅ Keep terminal open

**Troubleshooting**:
- **Port 4000 already in use**: Change `PORT` in `.env` or stop other service
- **Database connection error**: Check `DATABASE_URL` in `.env`
- **Module not found**: Run `npm install` again
- **TypeScript errors**: Run `npx prisma generate` in backend directory

- [ ] Backend server starts without errors
- [ ] Server running on http://localhost:4000
- [ ] API responds to test requests
- [ ] Backend terminal kept open

---

## Step 8: Verify Frontend Setup

**Time**: 5 minutes

### Instructions

1. **Open a NEW terminal** (keep backend terminal running)

2. **Navigate to frontend directory**:
   ```bash
   cd frontend-1
   ```

3. **Start frontend development server**:
   ```bash
   npm run dev
   ```
   
   **You should see output like**:
   ```
   VITE v5.x.x  ready in xxx ms
   
   ➜  Local:   http://localhost:5173/
   ➜  Network: use --host to expose
   ```

4. **Open browser** and navigate to: `http://localhost:5173`

5. **Verify frontend loads**:
   - You should see the login page
   - No console errors in browser DevTools (F12)

6. **Test login**:
   - Email: `admin@example.com`
   - Password: `admin123`
   - Click "Login"
   
   **Expected result**: 
   - Login successful
   - Redirected to dashboard
   - Can see navigation sidebar

7. **Test navigation**:
   - Click on "Suppliers" or "Master Data" in sidebar
   - Should see a list page with data
   - No errors in console

**Troubleshooting**:
- **Port 5173 already in use**: Vite will auto-use next available port
- **Connection refused**: Make sure backend is running on port 4000
- **CORS errors**: Check `VITE_API_BASE_URL` in `.env.local`
- **Blank page**: Check browser console for errors

- [ ] Frontend server starts without errors
- [ ] Frontend accessible at http://localhost:5173
- [ ] Login page loads
- [ ] Can login with admin credentials
- [ ] Dashboard loads after login
- [ ] Can navigate to master data pages
- [ ] No console errors

---

## Step 9: Verify Database Access

**Time**: 5 minutes

### Instructions

1. **Open Prisma Studio** (database GUI):
   ```bash
   cd backend
   npx prisma studio
   ```
   
   **This will open a browser window** at `http://localhost:5555`

2. **Explore database**:
   - Click on `user` table
   - You should see the admin user: `admin@example.com`
   - Click on `role` table - see available roles
   - Click on `view` table - see view definitions
   - Click on `supplier` table - see demo suppliers

3. **Verify data exists**:
   - Check that demo data was loaded
   - You should see records in various tables

4. **Close Prisma Studio** when done (Ctrl+C in terminal)

**Troubleshooting**:
- **Port 5555 in use**: Prisma Studio will use next available port
- **No data visible**: Re-run `node setup-db.js --demo-data=indian-demo`
- **Connection error**: Check `DATABASE_URL` in `.env`

- [ ] Prisma Studio opens successfully
- [ ] Can see `user` table with admin user
- [ ] Can see `role` table with roles
- [ ] Can see `view` table with views
- [ ] Can see demo data in business tables

---

## Step 10: Final Verification Checklist

**Time**: 5 minutes

### Complete System Check

Run through this checklist to ensure everything is set up correctly:

#### Repository Setup
- [ ] Monorepo cloned (`backend/` and `frontend-1/` present in the same tree)
- [ ] Backend and frontend dependencies installed

#### IDE Setup
- [ ] Cursor IDE workspace file opened (`fabriq.code-workspace`)
- [ ] Root, backend, and frontend folders visible in sidebar
- [ ] Single git repository visible in Source Control
- [ ] Can navigate between projects
- [ ] TypeScript/IntelliSense working

#### Environment Configuration
- [ ] Backend `.env` file configured
- [ ] Frontend `.env.local` file configured
- [ ] Database connection working
- [ ] JWT secret set

#### Database Setup
- [ ] Database created
- [ ] Schema loaded
- [ ] Metadata (roles, views) loaded
- [ ] Workflows configured
- [ ] Demo data loaded

#### Services Running
- [ ] Backend server running on port 4000
- [ ] Frontend server running on port 5173
- [ ] Can access frontend in browser
- [ ] Can login successfully
- [ ] Can navigate application

#### Database Access
- [ ] Prisma Studio works
- [ ] Can view tables
- [ ] Can see demo data

---

## Common Issues & Solutions

### Issue: "Cannot find module" errors

**Solution**:
```bash
# In backend
cd backend
rm -rf node_modules package-lock.json
npm install

# In frontend
cd frontend-1
rm -rf node_modules package-lock.json
npm install
```

### Issue: Database connection refused

**Solution**:
1. Check PostgreSQL is running: `pg_isready`
2. Verify `DATABASE_URL` in `.env` is correct
3. Check database exists: `psql -U postgres -l`
4. Verify user has permissions

### Issue: Port already in use

**Solution**:
- Backend: Change `PORT` in `.env` to different value (e.g., 4001)
- Frontend: Vite will auto-use next available port
- Update `VITE_API_BASE_URL` in frontend `.env.local` if backend port changed

### Issue: TypeScript errors in Cursor

**Solution**:
```bash
cd backend
npx prisma generate
npm run build  # This will show any TypeScript errors
```

### Issue: Login fails

**Solution**:
1. Verify database setup completed: `node setup-db.js --demo-data=indian-demo`
2. Check admin user exists: Use Prisma Studio to check `user` table
3. Verify backend is running
4. Check browser console for errors
5. Verify `VITE_API_BASE_URL` matches backend URL

---

## Next Steps

Once you've completed all steps and verified everything works:

1. ✅ **Read**: `CLAUDE.md` - Quick reference guide
2. ✅ **Read**: `docs/ARCHITECTURE.md` - System architecture overview
3. ✅ **Prepare**: For Session 2 - Understanding the Metadata-Driven Framework

**Congratulations!** 🎉 You've successfully set up your development environment!

---

## Session 1 Completion Checklist

Before moving to Session 2, ensure:

- [ ] Monorepo cloned with `backend/` and `frontend-1/`
- [ ] Cursor workspace file opened (`fabriq.code-workspace`)
- [ ] One git repository (monorepo) visible in Source Control
- [ ] Backend environment configured
- [ ] Frontend environment configured
- [ ] Database set up with demo data
- [ ] Backend server runs successfully
- [ ] Frontend server runs successfully
- [ ] Can login to application
- [ ] Can navigate application
- [ ] Prisma Studio works
- [ ] No blocking errors

**If all checkboxes are complete, you're ready for Session 2!**

---

**End of Session 1 Workbook**
