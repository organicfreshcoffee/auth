import { Router, Request, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { getDatabase } from '../config/database';
import { getFirebaseConfig, admin } from '../config/firebase';
import { createMinimalAuditLog, getAuditLogsForUser, pseudonymizeUserAuditLogs } from '../utils/auditLogger';

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

// Endpoint to record user login
router.post('/login', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    const userLoginsCollection = db.collection('user_logins');

    const loginRecord = {
      userId: req.user?.uid,
      email: req.user?.email,
      loginTime: new Date(),
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress || 'Unknown'
    };

    await userLoginsCollection.insertOne(loginRecord);

    res.json({ 
      success: true, 
      message: 'Login recorded successfully',
      userId: req.user?.uid 
    });
  } catch (error) {
    console.error('Error recording login:', error);
    res.status(500).json({ error: 'Failed to record login' });
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

// Endpoint to view user data (for audit logging purposes)
router.get('/user/view-data', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(`View data request from user: ${req.user?.uid} (${req.user?.email})`);

    // Create audit log for data viewing
    await createMinimalAuditLog(
      req.user?.uid || '',
      'DATA_VIEW',
      {
        endpoint: '/user/view-data',
        method: 'GET'
      }
    );

    const db = getDatabase();
    const userLoginsCollection = db.collection('user_logins');
    const adminsCollection = db.collection('admins');

    // Get all login records for the authenticated user
    const userLogins = await userLoginsCollection
      .find({ userId: req.user?.uid })
      .sort({ loginTime: -1 }) // Most recent first
      .toArray();

    // Check if user is an admin and get admin data
    const adminRecord = await adminsCollection.findOne({ email: req.user?.email });

    // Get audit logs for the user
    const auditLogs = await getAuditLogsForUser(req.user?.uid || '');

    const viewData = {
      user: {
        uid: req.user?.uid,
        email: req.user?.email,
        emailVerified: req.user?.email_verified,
        isAdmin: !!adminRecord
      },
      loginHistory: userLogins.map(login => ({
        _id: login._id,
        userId: login.userId,
        email: login.email,
        loginTime: login.loginTime,
        userAgent: login.userAgent,
        ip: login.ip
      })),
      adminData: adminRecord ? {
        email: adminRecord.email,
        createdAt: adminRecord.created_at,
        updatedAt: adminRecord.updated_at,
        addedBy: adminRecord.added_by || 'unknown'
      } : null,
      auditLogs: auditLogs.map(log => ({
        userId: log.userId,
        action: log.action,
        timestamp: log.timestamp,
        metadata: log.metadata
      })),
      viewMetadata: {
        viewDate: new Date().toISOString(),
        totalLoginRecords: userLogins.length,
        totalAuditRecords: auditLogs.length,
        hasAdminData: !!adminRecord,
        source: 'landing_page_server'
      }
    };

    console.log(`Viewed ${userLogins.length} login records and ${auditLogs.length} audit records for user ${req.user?.uid}${adminRecord ? ' (admin)' : ''}`);
    
    res.json({
      success: true,
      data: viewData
    });
  } catch (error) {
    console.error('Error viewing user data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to view user data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Endpoint to export user data
router.get('/user/export-data', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(`Export data request from user: ${req.user?.uid} (${req.user?.email})`);

    // Create audit log for data export
    await createMinimalAuditLog(
      req.user?.uid || '',
      'DATA_EXPORT',
      {
        endpoint: '/user/export-data',
        method: 'GET'
      }
    );

    const db = getDatabase();
    const userLoginsCollection = db.collection('user_logins');
    const adminsCollection = db.collection('admins');

    // Get all login records for the authenticated user
    const userLogins = await userLoginsCollection
      .find({ userId: req.user?.uid })
      .sort({ loginTime: -1 }) // Most recent first
      .toArray();

    // Check if user is an admin and get admin data
    const adminRecord = await adminsCollection.findOne({ email: req.user?.email });

    // Get audit logs for the user
    const auditLogs = await getAuditLogsForUser(req.user?.uid || '');

    const exportData = {
      user: {
        uid: req.user?.uid,
        email: req.user?.email,
        emailVerified: req.user?.email_verified,
        isAdmin: !!adminRecord
      },
      loginHistory: userLogins.map(login => ({
        _id: login._id,
        userId: login.userId,
        email: login.email,
        loginTime: login.loginTime,
        userAgent: login.userAgent,
        ip: login.ip
      })),
      adminData: adminRecord ? {
        email: adminRecord.email,
        createdAt: adminRecord.created_at,
        updatedAt: adminRecord.updated_at,
        addedBy: adminRecord.added_by || 'unknown'
      } : null,
      auditLogs: auditLogs.map(log => ({
        userId: log.userId,
        action: log.action,
        timestamp: log.timestamp,
        metadata: log.metadata
      })),
      exportMetadata: {
        exportDate: new Date().toISOString(),
        totalLoginRecords: userLogins.length,
        totalAuditRecords: auditLogs.length,
        hasAdminData: !!adminRecord,
        source: 'landing_page_server'
      }
    };

    console.log(`Exported ${userLogins.length} login records and ${auditLogs.length} audit records for user ${req.user?.uid}${adminRecord ? ' (admin)' : ''}`);
    
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    console.error('Error exporting user data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to export user data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Endpoint to delete user data from landing page
router.delete('/user/delete-data', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(`Delete data request from user: ${req.user?.uid} (${req.user?.email})`);

    // Create audit log for data deletion BEFORE deleting the data
    await createMinimalAuditLog(
      req.user?.uid || '',
      'DATA_DELETE',
      {
        endpoint: '/user/delete-data',
        method: 'DELETE',
        gdprCompliance: 'Article 17 - Right to Erasure'
      }
    );

    const db = getDatabase();
    const userLoginsCollection = db.collection('user_logins');
    const adminsCollection = db.collection('admins');

    // Check if user is an admin before deletion
    const adminRecord = await adminsCollection.findOne({ email: req.user?.email });
    
    // Delete all login records for the authenticated user
    const deleteResult = await userLoginsCollection.deleteMany({ 
      userId: req.user?.uid 
    });

    // Delete admin record if user is an admin
    let adminDeleteResult = null;
    if (adminRecord) {
      adminDeleteResult = await adminsCollection.deleteOne({ 
        email: req.user?.email 
      });
      console.log(`Deleted admin record for user ${req.user?.email}`);
    }

    // Pseudonymize audit logs to comply with GDPR while maintaining compliance records
    const pseudonymizedCount = await pseudonymizeUserAuditLogs(
      req.user?.uid || '', 
      req.user?.email || ''
    );

    console.log(`Deleted ${deleteResult.deletedCount} login records for user ${req.user?.uid}`);
    if (adminDeleteResult) {
      console.log(`Deleted ${adminDeleteResult.deletedCount} admin records for user ${req.user?.email}`);
    }
    console.log(`Pseudonymized ${pseudonymizedCount} audit log entries for GDPR compliance`);
    
    res.json({
      success: true,
      message: 'User data deleted successfully',
      deletedRecords: deleteResult.deletedCount,
      deletedAdminRecords: adminDeleteResult?.deletedCount || 0,
      pseudonymizedAuditLogs: pseudonymizedCount,
      userId: req.user?.uid,
      gdprCompliance: {
        personalDataDeleted: true,
        adminDataDeleted: !!adminDeleteResult,
        auditLogsPseudonymized: true,
        retentionReason: 'Legal compliance requirements',
        note: 'Personal identifiers removed from audit logs while preserving compliance records'
      }
    });
  } catch (error) {
    console.error('Error deleting user data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete user data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
