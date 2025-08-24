import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeFirebaseAdmin } from './config/firebase';
import { connectToDatabase } from './config/database';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import dungeonRoutes from './routes/dungeon';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - Configure CORS for development, staging, and production
const getAllowedOrigins = (): string[] => {
  if (process.env.NODE_ENV === 'production') {
    return [
      process.env.CLIENT_URL || 'https://organicfreshcoffee.com',
      'https://organicfreshcoffee.com',
      'https://www.organicfreshcoffee.com'
    ];
  } else if (process.env.NODE_ENV === 'staging') {
    const stagingOrigins = [
      process.env.CLIENT_URL || 'https://staging.organicfreshcoffee.com',
      'https://staging.organicfreshcoffee.com',
      'https://staging-api.organicfreshcoffee.com'
    ];
    
    // Add Cloud Run URLs if they exist
    if (process.env.CLIENT_URL_CLOUD_RUN) {
      stagingOrigins.push(process.env.CLIENT_URL_CLOUD_RUN);
    }
    if (process.env.SERVER_URL_CLOUD_RUN) {
      stagingOrigins.push(process.env.SERVER_URL_CLOUD_RUN);
    }
    
    return stagingOrigins;
  } else {
    return [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005'
    ];
  }
};

const allowedOrigins = getAllowedOrigins();

console.log(`🌐 CORS configured for ${process.env.NODE_ENV || 'development'} environment:`);
console.log('   Allowed origins:', allowedOrigins);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Initialize services before starting the server
async function initializeServices() {
  try {
    // Initialize Firebase Admin SDK first
    console.log('Initializing Firebase Admin SDK...');
    try {
      await initializeFirebaseAdmin();
    } catch (firebaseError) {
      console.error('Firebase initialization failed:', firebaseError);
      console.warn('Server will start without Firebase functionality');
      // Don't exit - allow server to start without Firebase in development
      if (process.env.NODE_ENV === 'production') {
        throw firebaseError;
      }
    }
    
    // Connect to Database
    console.log('Connecting to database...');
    try {
      await connectToDatabase();
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      console.warn('Server will start without database functionality');
      // Don't exit - allow server to start without database in development
      if (process.env.NODE_ENV === 'production') {
        throw dbError;
      }
    }
    
    console.log('Service initialization completed');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Routes (set up after services are initialized)
async function setupServer() {
  await initializeServices();
  
  app.use('/api', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/dungeon', dungeonRoutes);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Error handling middleware
  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Start the server
setupServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
