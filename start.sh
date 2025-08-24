#!/bin/bash

echo "Starting Organic Fresh Coffee Auth Microservice..."
echo "Building and starting auth service with Docker Compose..."

if [ ! -f .env ]; then
    echo "❌ .env file not found. Please copy .env.example to .env and configure your Firebase credentials."
    echo "   cp .env.example .env"
    echo "   Then edit .env with your actual Firebase configuration."
    exit 1
fi

export $(grep -v '^#' .env | xargs)

# Check if Firebase service account key exists
if [ ! -f "${GOOGLE_APPLICATION_CREDENTIALS}" ]; then
    echo "❌ Firebase service account key not found at: ${GOOGLE_APPLICATION_CREDENTIALS}"
    echo "   Please download your Firebase service account key and update the GOOGLE_APPLICATION_CREDENTIALS path in .env"
    exit 1
fi

# Start service
docker-compose up --build -d

echo "✅ Auth service starting up..."
echo ""
echo "🔗 Available service:"
echo "   � Auth Server (Express): http://localhost:3001"
echo ""
echo "📋 To view logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 To stop service:"
echo "   docker-compose down"
