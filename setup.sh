#!/bin/bash

# Setup script for Organic Fresh Coffee Auth Microservice
set -e

echo "🚀 Setting up Organic Fresh Coffee Auth Microservice..."
echo ""

# Check if required tools are installed
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker from https://www.docker.com/get-started"
    exit 1
fi
echo "✅ Docker $(docker --version)"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose"
    exit 1
fi
echo "✅ Docker Compose $(docker-compose --version)"

# Check Google Cloud CLI
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI is not installed. Please install from https://cloud.google.com/sdk/docs/install"
    exit 1
fi
echo "✅ Google Cloud CLI $(gcloud --version | head -n1)"

echo ""

# Setup environment file
echo "🔧 Setting up environment configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from template"
    echo "⚠️  Please edit .env with your Google Cloud project ID before continuing"
else
    echo "✅ .env file already exists"
fi

# Check if .env has been configured
if grep -q "your-gcp-project-id" .env; then
    echo "⚠️  Please update .env with your actual Google Cloud project ID"
    echo "   Edit the GOOGLE_CLOUD_PROJECT value in .env"
    exit 1
fi

# Check Google Cloud authentication
echo ""
echo "🔐 Checking Google Cloud configuration..."

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1 > /dev/null; then
    echo "❌ Not authenticated with Google Cloud. Please run: gcloud auth login"
    exit 1
fi
echo "✅ Google Cloud authenticated"

# Check if project is set
PROJECT_ID=$(grep GOOGLE_CLOUD_PROJECT .env | cut -d'=' -f2)
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")

if [ "$PROJECT_ID" != "$CURRENT_PROJECT" ]; then
    echo "⚠️  Setting Google Cloud project to: $PROJECT_ID"
    gcloud config set project "$PROJECT_ID"
fi

# Check if Secret Manager API is enabled
echo "📡 Checking Secret Manager API..."
if ! gcloud services list --enabled --filter="name:secretmanager.googleapis.com" --format="value(name)" | grep -q secretmanager; then
    echo "⚠️  Enabling Secret Manager API..."
    gcloud services enable secretmanager.googleapis.com
fi
echo "✅ Secret Manager API enabled"

# Check if required secrets exist
echo "🔍 Checking required secrets..."
SECRETS_MISSING=false

if ! gcloud secrets describe firebase-service-account &>/dev/null; then
    echo "❌ Secret 'firebase-service-account' not found"
    SECRETS_MISSING=true
fi

if ! gcloud secrets describe firebase-client-config &>/dev/null; then
    echo "❌ Secret 'firebase-client-config' not found"
    SECRETS_MISSING=true
fi

if [ "$SECRETS_MISSING" = true ]; then
    echo ""
    echo "❌ Required secrets are missing. Please follow the setup instructions in README.md:"
    echo "   1. Create Firebase service account secret"
    echo "   2. Create Firebase client config secret"
    echo "   3. Set up service account permissions"
    exit 1
fi
echo "✅ Required secrets found in Secret Manager"

# Check service account key
SERVICE_ACCOUNT_KEY=$(grep GOOGLE_APPLICATION_CREDENTIALS .env | cut -d'=' -f2)
if [ ! -f "$SERVICE_ACCOUNT_KEY" ]; then
    echo "❌ Service account key not found at: $SERVICE_ACCOUNT_KEY"
    echo "   Please create a service account key as described in README.md"
    echo "   Or update GOOGLE_APPLICATION_CREDENTIALS in .env with the correct path"
    exit 1
fi
echo "✅ Service account key found at: $SERVICE_ACCOUNT_KEY"

# Install client dependencies
echo ""
echo "📦 Installing client dependencies..."
cd client
if [ ! -d node_modules ]; then
    npm install
    echo "✅ Client dependencies installed"
else
    echo "✅ Client dependencies already installed"
fi
cd ..

# Install server dependencies
echo ""
echo "📦 Installing server dependencies..."
cd server
if [ ! -d node_modules ]; then
    npm install
    echo "✅ Server dependencies installed"
else
    echo "✅ Server dependencies already installed"
fi
cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "� Ready to start the application:"
echo "   ./start.sh"
echo ""
echo "🌐 The application will be available at:"
echo "   http://localhost:3000"
echo ""
echo "📚 For detailed information, see README.md"
