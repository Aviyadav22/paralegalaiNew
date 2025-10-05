#!/bin/bash

# Phase 1 Setup Script
# Automated setup for PostgreSQL integration

set -e  # Exit on any error

echo "============================================================"
echo "  Paralegal AI - Phase 1: PostgreSQL Setup"
echo "============================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Step 1: Check if PostgreSQL is installed
echo "Step 1: Checking PostgreSQL installation..."
if command -v psql &> /dev/null; then
    PG_VERSION=$(psql --version | awk '{print $3}')
    print_success "PostgreSQL is installed (version: $PG_VERSION)"
else
    print_error "PostgreSQL is not installed"
    echo ""
    echo "Please install PostgreSQL first:"
    echo "  Ubuntu/Debian: sudo apt install postgresql postgresql-contrib"
    echo "  macOS: brew install postgresql"
    echo "  Windows: Download from https://www.postgresql.org/download/"
    exit 1
fi
echo ""

# Step 2: Check if database exists
echo "Step 2: Checking database setup..."
read -p "Enter database name [paralegal_ai]: " DB_NAME
DB_NAME=${DB_NAME:-paralegal_ai}

read -p "Enter PostgreSQL username [paralegal_user]: " DB_USER
DB_USER=${DB_USER:-paralegal_user}

read -sp "Enter PostgreSQL password: " DB_PASS
echo ""

read -p "Enter PostgreSQL host [localhost]: " DB_HOST
DB_HOST=${DB_HOST:-localhost}

read -p "Enter PostgreSQL port [5432]: " DB_PORT
DB_PORT=${DB_PORT:-5432}

# Test connection
CONNECTION_STRING="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo ""
echo "Testing connection to: ${DB_HOST}:${DB_PORT}/${DB_NAME}..."

if PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" &> /dev/null; then
    print_success "Database connection successful"
else
    print_warning "Could not connect to database"
    echo ""
    read -p "Do you want to create the database? (y/n): " CREATE_DB
    if [ "$CREATE_DB" = "y" ]; then
        echo "Attempting to create database..."
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || print_warning "Database may already exist"
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || print_warning "User may already exist"
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
        print_success "Database setup completed"
    else
        print_error "Cannot proceed without database access"
        exit 1
    fi
fi
echo ""

# Step 3: Update .env file
echo "Step 3: Configuring environment variables..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success "Created .env from .env.example"
    else
        print_warning ".env.example not found, creating new .env"
        touch .env
    fi
fi

# Remove existing POSTGRES_CONNECTION_STRING if present
sed -i '/POSTGRES_CONNECTION_STRING/d' .env 2>/dev/null || true

# Add new connection string
echo "" >> .env
echo "# PostgreSQL Metadata DB (Added by setup script)" >> .env
echo "POSTGRES_CONNECTION_STRING=\"${CONNECTION_STRING}\"" >> .env

print_success "Updated .env with PostgreSQL configuration"
echo ""

# Step 4: Install dependencies
echo "Step 4: Checking Node.js dependencies..."
if [ -f "package.json" ]; then
    if [ -d "node_modules" ]; then
        print_success "Dependencies already installed"
    else
        echo "Installing dependencies..."
        if command -v yarn &> /dev/null; then
            yarn install
        else
            npm install
        fi
        print_success "Dependencies installed"
    fi
else
    print_warning "package.json not found in current directory"
fi
echo ""

# Step 5: Run migrations and tests
echo "Step 5: Running database migrations and tests..."
echo ""
node utils/database/testPostgres.js

if [ $? -eq 0 ]; then
    echo ""
    print_success "Phase 1 setup completed successfully!"
    echo ""
    echo "============================================================"
    echo "  ✓ PostgreSQL is configured and working"
    echo "  ✓ Database tables created"
    echo "  ✓ All tests passed"
    echo "============================================================"
    echo ""
    echo "Next steps:"
    echo "1. Start uploading legal documents with metadata"
    echo "2. Use filtered search for better performance"
    echo "3. Proceed to Phase 2 for PDF metadata extraction"
    echo ""
    echo "Documentation: /home/azureuser/PHASE1_SETUP_GUIDE.md"
    echo ""
else
    echo ""
    print_error "Phase 1 setup encountered errors"
    echo ""
    echo "Please check the error messages above and:"
    echo "1. Verify PostgreSQL is running"
    echo "2. Check database credentials"
    echo "3. Review PHASE1_SETUP_GUIDE.md for troubleshooting"
    echo ""
    exit 1
fi

