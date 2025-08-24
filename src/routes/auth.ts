import { Router, Request, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { getFirebaseConfig } from '../config/firebase';

const router = Router();

// Endpoint to get Firebase client configuration
router.get('/firebase-config', async (req: Request, res: Response) => {
  try {
    console.log(`[${new Date().toISOString()}] Firebase config request received`);
    console.log('Request headers:', req.headers);
    console.log('Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ? 'SET' : 'NOT SET',
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'SET' : 'NOT SET'
    });
    
    const config = await getFirebaseConfig();
    console.log('Firebase config retrieved successfully, sending response');
    res.json(config);
  } catch (error) {
    console.error('Error getting Firebase config:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    // Send minimal error information in production for security
    res.status(500).json({ 
      error: 'Failed to get Firebase configuration',
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint to verify authentication status
router.get('/verify', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    authenticated: true,
    user: {
      uid: req.user?.uid,
      email: req.user?.email,
      emailVerified: req.user?.email_verified
    }
  });
});

export default router;
