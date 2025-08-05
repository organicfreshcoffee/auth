# Organic Fresh Coffee Landing Page

A full-stack web application built with Next.js, Express.js, Firebase Auth, and MongoDB. This project demonstrates a complete authentication flow with user login tracking.

## 🏗️ Architecture

- **Frontend**: Next.js 14 with TypeScript
- **Backend**: Express.js with TypeScript
- **Authentication**: Firebase Auth
- **Database**: MongoDB
- **Infrastructure**: Docker Compose for local development
- **Secrets Management**: Google Cloud Secret Manager
- **Cloud**: Google Cloud Platform (GCP) with Secret Manager

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker](https://www.docker.com/get-started) and Docker Compose
- [Git](https://git-scm.com/)
- A [Firebase](https://firebase.google.com/) account
- A [Google Cloud Platform](https://cloud.google.com/) account
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (gcloud)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/organicfreshcoffee/landing.git
cd landing
```

### 2. Set Up Firebase

#### Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"  
3. Follow the setup wizard to create your project
4. Enable Authentication:
   - Go to **Authentication** > **Sign-in method**
   - Enable **Email/Password** provider

#### Generate Firebase Credentials

**For the Web App (Client-side):**
1. In your Firebase project, go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" and click **Web** icon (`</>`)
3. Register your app with a nickname (e.g., "Landing Page")
4. Copy the Firebase config object - you'll need these values for Secret Manager

**For Admin SDK (Server-side):**
1. In **Project Settings**, go to the **Service accounts** tab
2. Click **Generate new private key**
3. Download the JSON file and save it temporarily as `firebase-service-account.json`

### 3. Set Up Google Cloud Platform & Secret Manager

This project uses Google Cloud Secret Manager to securely store all Firebase credentials instead of environment variables.

#### Install and Configure Google Cloud CLI
```bash
# Install Google Cloud CLI (if not already installed)
# Follow instructions at: https://cloud.google.com/sdk/docs/install

# Authenticate with Google Cloud
gcloud auth login

# Set your project (use the same project ID as Firebase)
gcloud config set project YOUR_PROJECT_ID

# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com
```

#### Store Firebase Secrets in Secret Manager

**1. Store Firebase Service Account:**
```bash
# Create the service account secret
gcloud secrets create firebase-service-account \
    --replication-policy="automatic"

# Add the service account JSON file as the secret value
gcloud secrets versions add firebase-service-account \
    --data-file="./firebase-service-account.json"
```

**2. Store Firebase Client Configuration:**

Create a JSON file with your Firebase web app configuration:

```json
{
  "apiKey": "your-web-api-key",
  "authDomain": "your-project-id.firebaseapp.com", 
  "projectId": "your-project-id",
  "storageBucket": "your-project-id.appspot.com",
  "messagingSenderId": "your-sender-id",
  "appId": "your-app-id"
}
```

Save this as `firebase-client-config.json`, then store it:
```bash
# Create the client config secret
gcloud secrets create firebase-client-config \
    --replication-policy="automatic"

# Add the client config JSON as the secret value  
gcloud secrets versions add firebase-client-config \
    --data-file="./firebase-client-config.json"
```

**3. Set up Service Account for Application Access:**

Create a service account for the application to access secrets:
```bash
# Create a service account for the application
gcloud iam service-accounts create landing-app \
    --display-name="Landing App Service Account"

# Grant Secret Manager access
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:landing-app@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Create and download a key for the service account
gcloud iam service-accounts keys create ./service-account-key.json \
    --iam-account=landing-app@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

**4. Clean up temporary files:**
```bash
# Remove the temporary Firebase files (secrets are now in Secret Manager)
rm firebase-service-account.json firebase-client-config.json
```

### 4. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your Google Cloud configuration:

```bash
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

# Environment Configuration
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Note: Firebase secrets are stored in GCP Secret Manager
# See setup instructions above
```

**Important**: 
- Replace `your-gcp-project-id` with your actual Google Cloud project ID
- Ensure `service-account-key.json` is in the project root directory  
- All Firebase secrets are now stored securely in Google Cloud Secret Manager

### 5. Start the Application

The easiest way to run the entire stack:

```bash
./start.sh
```

Or manually with Docker Compose:

```bash
docker-compose up --build
```

### 6. Access the Application

- **Frontend (Next.js)**: http://localhost:3000
- **Backend (Express)**: http://localhost:3001  
- **MongoDB**: mongodb://localhost:27017

### Testing Multiple Clients

Run the client twice locally

In one terminal, start all services:
```
docker-compose up
```

In another terminal, start the second client:
```
cd client
NEXT_PUBLIC_API_URL=http://localhost:3001 GOOGLE_CLOUD_PROJECT=<project_id> npm run dev
```

## 📦 Dependencies

### Frontend (`/client`)

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^14.0.4 | React framework |
| `react` | ^18 | UI library |
| `react-dom` | ^18 | React DOM renderer |
| `firebase` | ^10.7.1 | Firebase client SDK |
| `axios` | ^1.6.2 | HTTP client |
| `typescript` | ^5 | Type safety |

### Backend (`/server`)

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.18.2 | Web framework |
| `mongodb` | ^6.3.0 | MongoDB driver |
| `firebase-admin` | ^12.0.0 | Firebase Admin SDK |
| `@google-cloud/secret-manager` | ^5.0.1 | GCP Secret Manager |
| `cors` | ^2.8.5 | Cross-origin requests |
| `dotenv` | ^16.3.1 | Environment variables |
| `typescript` | ^5.3.3 | Type safety |

## 🔧 Development

### Running Individual Services

**Client only:**
```bash
cd client
npm install
npm run dev
```

**Server only:**
```bash
cd server
npm install
npm run dev
```

**MongoDB only:**
```bash
docker run -d -p 27017:27017 --name mongodb \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:7
```

### Available Scripts

**Client:**
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

**Server:**
- `npm run dev` - Start development server with nodemon
- `npm run build` - Compile TypeScript
- `npm run start` - Start production server

## 🏗️ Project Structure

```
landing/
├── client/                 # Next.js frontend
│   ├── lib/               # Utilities and configurations
│   │   ├── auth.tsx       # Authentication context
│   │   └── firebase.ts    # Firebase client config
│   ├── pages/             # Next.js pages
│   │   ├── _app.tsx       # App wrapper
│   │   ├── index.tsx      # Login page
│   │   └── dashboard.tsx  # Dashboard page
│   └── styles/            # CSS modules
├── server/                # Express.js backend
│   └── src/
│       ├── config/        # Configuration files
│       │   ├── database.ts    # MongoDB connection
│       │   └── firebase.ts    # Firebase Admin setup
│       ├── middleware/    # Express middleware
│       │   ├── auth.ts        # Authentication middleware
│       │   └── errorHandler.ts # Error handling
│       ├── routes/        # API routes
│       │   └── auth.ts        # Authentication routes
│       └── index.ts       # Server entry point
├── docker-compose.yml     # Docker services
├── init-mongo.js         # MongoDB initialization
├── start.sh              # Startup script
└── .env.example          # Environment template
```

## 🔐 Security Features

- **Google Cloud Secret Manager**: All sensitive Firebase credentials stored securely
- **Firebase Authentication**: Secure user authentication with JWT tokens
- **JWT Token Verification**: Server-side token validation
- **No Environment Secrets**: No sensitive data in `.env` files or code
- **IAM Access Controls**: Fine-grained permissions for secret access
- **Audit Logging**: Complete audit trail of secret access
- **CORS Configuration**: Cross-origin request security

## 🚀 Features

- **User Registration & Login**: Email/password authentication
- **Protected Routes**: Authentication-required pages
- **Login Tracking**: MongoDB storage of user login events
- **Responsive Design**: Mobile-friendly interface
- **Real-time Updates**: Login history display
- **Docker Support**: Containerized development environment

## 🛠️ Troubleshooting

### Common Issues

1. **Secret Manager Access Error**
   ```
   Error: Failed to retrieve secret: firebase-service-account
   ```
   **Solution**: 
   - Verify your service account has `roles/secretmanager.secretAccessor` permission
   - Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to the correct service account key
   - Check that the secret exists: `gcloud secrets list`

2. **Firebase Configuration Error**
   ```
   Error: Failed to retrieve Firebase client configuration
   ```
   **Solution**: 
   - Verify the `firebase-client-config` secret exists in Secret Manager
   - Check the secret contains valid JSON: `gcloud secrets versions access latest --secret="firebase-client-config"`

3. **MongoDB Connection Failed**
   ```
   Error connecting to MongoDB
   ```
   **Solution**: Make sure MongoDB is running and the connection string is correct.

4. **Google Cloud Project Not Set**
   ```
   Error: GOOGLE_CLOUD_PROJECT environment variable is required
   ```
   **Solution**: Ensure your `.env` file has the correct `GOOGLE_CLOUD_PROJECT` value.

5. **Service Account Key Not Found**
   ```
   Error: Cannot find module './service-account-key.json'
   ```
   **Solution**: Ensure the GCP service account key file exists in the project root.

6. **MongoDB Initialization Script Not Running**
   ```
   Initial server data not found in database
   ```
   **Solution**: The `init-mongo.js` script only runs when MongoDB creates a fresh database. If you need to rerun it:
   ```bash
   docker-compose down
   docker volume rm landing_mongodb_data
   docker-compose up -d
   ```
   **Note**: This will delete all existing MongoDB data and recreate the database with initial data.

### Debug Commands

```bash
# Check running containers
docker-compose ps

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Clean rebuild
docker-compose down
docker-compose up --build

# Check Secret Manager secrets
gcloud secrets list

# View a secret value (for debugging)
gcloud secrets versions access latest --secret="firebase-service-account"
gcloud secrets versions access latest --secret="firebase-client-config"

# Test service account permissions
gcloud auth activate-service-account --key-file=./service-account-key.json
gcloud secrets versions access latest --secret="firebase-service-account"

# Reset MongoDB and rerun initialization script
docker-compose down
docker volume rm landing_mongodb_data
docker-compose up -d
```

## 🌍 Deployment

### Production Considerations

1. **Environment Variables**: Use production Firebase project
2. **Secret Manager**: Store sensitive data in GCP Secret Manager
3. **Database**: Use MongoDB Atlas or managed MongoDB
4. **SSL/TLS**: Configure HTTPS
5. **Domain**: Update CORS and redirect URLs

### Docker Production Build

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.prod.yml up -d
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues or need help:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Review the [Firebase Documentation](https://firebase.google.com/docs)
3. Open an issue on GitHub
4. Check Docker and Docker Compose documentation

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) for the amazing React framework
- [Firebase](https://firebase.google.com/) for authentication services
- [MongoDB](https://www.mongodb.com/) for the database
- [Docker](https://www.docker.com/) for containerization
