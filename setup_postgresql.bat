@echo off
echo ========================================
echo PostgreSQL Setup for Paralegal AI
echo ========================================
echo.

echo Step 1: Installing PostgreSQL...
echo Please download and install PostgreSQL from:
echo https://www.postgresql.org/download/windows/
echo.
echo After installation, press any key to continue...
pause

echo.
echo Step 2: Creating Database and User...
echo.

set /p PGPASSWORD="Enter PostgreSQL admin password: "

echo Creating database and user...
psql -U postgres -c "CREATE DATABASE paralegalai;"
psql -U postgres -c "CREATE USER paralegalai_user WITH ENCRYPTED PASSWORD 'ParalegalAI@2025';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE paralegalai TO paralegalai_user;"
psql -U postgres -d paralegalai -c "GRANT ALL ON SCHEMA public TO paralegalai_user;"
psql -U postgres -d paralegalai -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO paralegalai_user;"
psql -U postgres -d paralegalai -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO paralegalai_user;"
psql -U postgres -d paralegalai -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO paralegalai_user;"
psql -U postgres -d paralegalai -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO paralegalai_user;"

echo.
echo Step 3: Testing connection...
psql -U paralegalai_user -d paralegalai -c "SELECT version();"

echo.
echo ========================================
echo PostgreSQL setup completed!
echo ========================================
echo.
echo Database: paralegalai
echo User: paralegalai_user
echo Password: ParalegalAI@2025
echo.
echo Next steps:
echo 1. Update .env file with: DATABASE_URL="postgresql://paralegalai_user:ParalegalAI@2025@localhost:5432/paralegalai"
echo 2. Run: cd server
echo 3. Run: npm install @azure/storage-blob pg
echo 4. Run: npx prisma generate
echo 5. Run: npx prisma migrate deploy
echo.
pause
