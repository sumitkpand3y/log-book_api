import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

// Define UserRole type explicitly (adjust values as per your schema)
export type UserRole = 'ADMIN' | 'USER' | 'OTHER';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: UserRole;
    name: string;
    email: string;
  };
}

interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Access token required'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid token - user not found'
      });
      return;
    }

    // Attach user to request
    (req as AuthenticatedRequest).user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
      return;
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Role-based authorization middleware
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

// Optional authentication (for public endpoints that can work with or without auth)
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    
    if (!process.env.JWT_SECRET) {
      next();
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    if (user) {
      (req as AuthenticatedRequest).user = user;
    }
    
    next();
  } catch (error) {
    // For optional auth, we don't return errors, just continue without user
    next();
  }
};


export const teacherMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if ((req as any).user?.role !== 'TEACHER' && (req as any).user?.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      message: 'Access denied. Teacher role required.'
    });
    return;
  }
  next();
};