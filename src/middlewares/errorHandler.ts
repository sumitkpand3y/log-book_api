import { Request, Response, NextFunction } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors: Record<string, string> = {};

  // Prisma errors
  if (err instanceof PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        // Unique constraint violation
        statusCode = 400;
        const field = err.meta?.target as string[];
        message = `Duplicate value for ${field?.[0] || 'field'}`;
        if (field?.[0]) {
          errors[field[0]] = `This ${field[0]} already exists`;
        }
        break;
        
      case 'P2025':
        // Record not found
        statusCode = 404;
        message = 'Record not found';
        break;
        
      case 'P2003':
        // Foreign key constraint violation
        statusCode = 400;
        message = 'Invalid reference to related record';
        break;
        
      case 'P2014':
        // Required relation violation
        statusCode = 400;
        message = 'Missing required relationship';
        break;
        
      default:
        statusCode = 500;
        message = 'Database operation failed';
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
  }

  // Log error in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      statusCode,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(Object.keys(errors).length > 0 && { errors }),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`
  });
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Custom error class
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}