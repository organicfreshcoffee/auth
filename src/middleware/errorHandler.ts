import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('Error:', err);

  // Default error
  let status = 500;
  let message = 'Internal Server Error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  } else if (err.code === 11000) { // MongoDB duplicate key error
    status = 409;
    message = 'Resource already exists';
  }

  res.status(status).json({
    error: message,
    timestamp: new Date().toISOString(),
    path: req.path
  });
}
