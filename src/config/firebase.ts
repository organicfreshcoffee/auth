import admin from 'firebase-admin';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let isInitialized = false;
let secretClient: SecretManagerServiceClient;

// Initialize the Secret Manager client with proper error handling
try {
  secretClient = new SecretManagerServiceClient();
  console.log('Secret Manager client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Secret Manager client:', error);
  throw new Error('Secret Manager client initialization failed');
}

async function getSecretValue(secretName: string): Promise<string> {
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    console.log(`Attempting to access secret: ${secretName} in project: ${projectId}`);
    
    if (!projectId) {
      console.error('GOOGLE_CLOUD_PROJECT environment variable is not set');
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
    }

    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    console.log(`Secret path: ${name}`);
    
    const [version] = await secretClient.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString();
    
    if (!payload) {
      console.error(`Empty secret value for ${secretName}`);
      throw new Error(`Empty secret value for ${secretName}`);
    }
    
    console.log(`Successfully retrieved secret: ${secretName}`);
    return payload;
  } catch (error) {
    console.error(`Error accessing secret ${secretName}:`, error);
    
    // Type-safe error logging
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to retrieve secret: ${secretName} - ${error.message}`);
    } else {
      console.error('Unknown error type:', typeof error, error);
      throw new Error(`Failed to retrieve secret: ${secretName} - Unknown error`);
    }
  }
}

export async function initializeFirebaseAdmin() {
  if (isInitialized) {
    return admin;
  }

  try {
    console.log('Initializing Firebase Admin SDK...');
    
    // Get Firebase service account from Secret Manager (for production or when local file not available)
    const serviceAccountJson = await getSecretValue('firebase-service-account');
    const serviceAccount = JSON.parse(serviceAccountJson);

    if (!serviceAccount.project_id) {
      throw new Error('Invalid Firebase service account configuration');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    isInitialized = true;
    console.log('Firebase Admin SDK initialized successfully with GCP Secret Manager');
    return admin;
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    throw error;
  }
}

export async function getFirebaseConfig() {
  try {
    console.log('Fetching Firebase client config from GCP Secret Manager...');
    console.log('Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
    // Get Firebase client configuration from Secret Manager
    const configJson = await getSecretValue('firebase-client-config');
    const config = JSON.parse(configJson);
    
    console.log('Firebase config retrieved successfully from GCP Secret Manager');
    return config;
  } catch (error) {
    console.error('Error getting Firebase config:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to retrieve Firebase client configuration: ${error.message}`);
    } else {
      throw new Error('Failed to retrieve Firebase client configuration: Unknown error');
    }
  }
}

export { admin };
