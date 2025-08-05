@echo off
REM Production startup script for Quote Service

echo 🚀 Starting Quote Service in production mode...

REM Check if required environment variables are set
if "%DATABASE_URL%"=="" (
    echo ❌ ERROR: DATABASE_URL environment variable is required
    exit /b 1
)

REM Create data directory if it doesn't exist
if not exist "data" mkdir data

REM Run database migrations
echo 📊 Running database migrations...
npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo ❌ Database migration failed
    exit /b 1
)

REM Generate Prisma client
echo 🔧 Generating Prisma client...
npx prisma generate
if %errorlevel% neq 0 (
    echo ❌ Prisma client generation failed
    exit /b 1
)

REM Start the application
echo 🚀 Starting Quote Service...
node dist/index.js