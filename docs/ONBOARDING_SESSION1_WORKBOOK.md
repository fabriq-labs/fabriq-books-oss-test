# Session 1: IDE Setup & Environment Configuration

**Duration**: 2 hours  
**Objective**: Set up your development environment with Cursor IDE, clone repositories, configure environment variables, and verify everything works.

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
  
- [ ] **Access to repositories**
  - Backend repository URL: `_________________`
  - Frontend repository URL: `_________________`
  - Documentation repository URL (if separate): `_________________`
  
- [ ] **Database credentials**
  - Database host: `_________________`
  - Database name: `_________________`
  - Database user: `_________________`
  - Database password: `_________________`

---

## Step 1: Create Workspace Directory

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

4. Verify you're in the right location:
   ```bash
   pwd  # macOS/Linux
   # or
   cd   # Windows
   ```

**Expected Output**: You should see the path to `fabriq-workspace`

- [ ] Workspace directory created
- [ ] Currently in `fabriq-workspace` directory

---

## Step 2: Clone Backend Repository

**Time**: 10 minutes

### Instructions

1. Clone the backend repository:
   ```bash
   git clone <BACKEND_REPO_URL> backend
   ```
   
   **Replace `<BACKEND_REPO_URL>` with the actual repository URL**

2. Navigate into the backend directory:
   ```bash
   cd backend
   ```

3. Check that files are present:
   ```bash
   ls -la  # macOS/Linux
   # or
   dir     # Windows
   ```
   
   **You should see**:
   - `package.json`
   - `prisma/` directory
   - `src/` directory
   - `.env.example` file

4. Install dependencies:
   ```bash
   npm install
   ```
   
   **This may take 2-5 minutes. Wait for it to complete.**

5. Verify installation:
   ```bash
   npm list --depth=0
   ```
   
   **You should see a list of installed packages without errors.**

**Troubleshooting**:
- If `npm install` fails, check your Node.js version: `node --version` (should be 18+)
- If you get permission errors, try: `sudo npm install` (macOS/Linux)
- If you get network errors, check your internet connection

- [ ] Backend repository cloned
- [ ] Dependencies installed successfully
- [ ] No errors in npm output

---

## Step 3: Clone Frontend Repository

**Time**: 10 minutes

### Instructions

1. Navigate back to workspace root:
   ```bash
   cd ..
   ```

2. Clone the frontend repository:
   ```bash
   git clone <FRONTEND_REPO_URL> frontend-1
   ```
   
   **Replace `<FRONTEND_REPO_URL>` with the actual repository URL**

3. Navigate into the frontend directory:
   ```bash
   cd frontend-1
   ```

4. Check that files are present:
   ```bash
   ls -la  # macOS/Linux
   # or
   dir     # Windows
   ```
   
   **You should see**:
   - `package.json`
   - `src/` directory
   - `vite.config.ts`
   - `.env.example` file

5. Install dependencies:
   ```bash
   npm install
   ```
   
   **This may take 3-5 minutes. Wait for it to complete.**

6. Verify installation:
   ```bash
   npm list --depth=0
   ```

- [ ] Frontend repository cloned
- [ ] Dependencies installed successfully
- [ ] No errors in npm output

---

## Step 4: Clone Documentation Repository (Optional)

**Time**: 5 minutes

### Instructions

1. Navigate back to workspace root:
   ```bash
   cd ..
   ```

2. If documentation is in a separate repository, clone it:
   ```bash
   git clone <DOCS_REPO_URL> docs
   ```
   
   **If documentation is in the main repository, skip this step.**

3. Verify docs directory exists:
   ```bash
   ls -la docs  # Should show files if separate repo
   # or check if docs folder exists in backend/frontend
   ```

- [ ] Documentation repository cloned (if separate)
- [ ] Or verified docs exist in main repository

---

## Step 5: Configure Cursor IDE Workspace

**Time**: 15 minutes

### Instructions

1. **Open Cursor IDE**

2. **Create Workspace File**:
   - In Cursor, go to: `File → Open Folder...`
   - Navigate to and select: `fabriq-workspace`
   - Click "Open"

3. **Create Workspace Configuration File**:
   - In Cursor, go to: `File → Save Workspace As...`
   - Save as: `fabriq-workspace.code-workspace`
   - This creates a multi-root workspace

4. **Edit Workspace File** (if needed):
   
   Open `fabriq-workspace.code-workspace` and ensure it contains:
   ```json
   {
     "folders": [
       {
         "path": "backend",
         "name": "Backend (Node.js/Express)"
       },
       {
         "path": "frontend-1",
         "name": "Frontend (React/Vite)"
       },
       {
         "path": "docs",
         "name": "Documentation"
       }
     ],
     "settings": {
       "typescript.tsdk": "backend/node_modules/typescript/lib",
       "editor.formatOnSave": true,
       "files.exclude": {
         "**/node_modules": true,
         "**/.git": true
       },
       "search.exclude": {
         "**/node_modules": true,
         "**/dist": true,
         "**/.next": true
       }
     }
   }
   ```
   
   **Note**: If `docs` folder doesn't exist, remove that folder entry.

5. **Reload Workspace**:
   - Close Cursor
   - Reopen Cursor
   - Open the workspace file: `fabriq-workspace.code-workspace`
   - You should now see multiple folders in the sidebar

6. **Verify Workspace Setup**:
   - Check sidebar shows:
     - ✅ Backend (Node.js/Express)
     - ✅ Frontend (React/Vite)
     - ✅ Documentation (if exists)
   - You should be able to navigate between folders

**Troubleshooting**:
- If folders don't appear, make sure paths are relative to workspace root
- If TypeScript errors appear, wait for Cursor to index files (may take a minute)

- [ ] Cursor IDE opened
- [ ] Workspace file created
- [ ] All folders visible in sidebar
- [ ] Can navigate between backend and frontend folders

---

## Step 6: Configure Backend Environment

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

## Step 7: Configure Frontend Environment

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

## Step 8: Set Up Database

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

## Step 9: Verify Backend Setup

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

## Step 10: Verify Frontend Setup

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

## Step 11: Verify Database Access

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

## Step 12: Final Verification Checklist

**Time**: 5 minutes

### Complete System Check

Run through this checklist to ensure everything is set up correctly:

#### Repository Setup
- [ ] Backend repository cloned
- [ ] Frontend repository cloned
- [ ] Documentation accessible (if separate)
- [ ] All dependencies installed

#### IDE Setup
- [ ] Cursor IDE workspace configured
- [ ] All folders visible in sidebar
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

- [ ] All repositories cloned
- [ ] Cursor workspace configured
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
