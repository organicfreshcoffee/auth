import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Error: err

  // Default error
  let status = 500;
  let message = 'Internal Server Error';

  // Handle specific error types
  if (typeof err === 'object' && err !== null) {
    const errorObj = err as { name?: string; message?: string; code?: number };
    if (errorObj.name === 'ValidationError') {
      status = 400;
      message = errorObj.message ?? message;
    } else if (errorObj.name === 'UnauthorizedError') {
      status = 401;
      message = 'Unauthorized';
    } else if (errorObj.code === 11000) { // MongoDB duplicate key error
      status = 409;
      message = 'Resource already exists';
    }
  }

  res.status(status).json({
    error: message,
    timestamp: new Date().toISOString(),
    path: req.path
  });
}
