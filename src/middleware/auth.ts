import { Request, Response, NextFunction } from 'express';
import { admin } from '../config/firebase.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    [key: string]: unknown;
  };
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Check if Firebase Admin is properly initialized
    if (!admin.apps.length) {
      // Firebase Admin not initialized - cannot verify tokens
      return res.status(503).json({ 
        error: 'Authentication service unavailable',
        details: process.env.NODE_ENV === 'development' ? 'Firebase Admin SDK not initialized' : undefined
      });
    }

  // Verify the Firebase ID token
  const decodedToken = await admin.auth().verifyIdToken(token);
  req.user = decodedToken;
  // Token verified for user: ${decodedToken.uid} (${decodedToken.email})
  next();
  } catch {
    // Error verifying token
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
