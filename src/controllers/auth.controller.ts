import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import prisma from '../models/prisma';
import { generateToken } from '../utils/jwt';

export class AuthController {
  static validateRegister = [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
  ];
  
  static validateLogin = [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ];
  
  static register = async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { email, password, firstName, lastName, phone } = req.body;
      
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });
      
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists with this email' });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        }
      });
      
      // Generate token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      
      res.status(201).json({
        message: 'User registered successfully',
        token,
        user,
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
  
  static login = async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { email, password } = req.body;
      
      // Find user
      const user = await prisma.user.findUnique({
        where: { email }
      });
      
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Generate token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
  
  static getProfile = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          avatar: true,
          phone: true,
          createdAt: true,
        }
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json({ user });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
  static verifyToken = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          avatar: true,
          phone: true,
          createdAt: true,
        }
      }); // populated by your `authenticate` middleware
      if (!user) {
        return res.status(401).json({ message: 'Invalid token' });
      }
      return res.status(200).json({ user });
    } catch (err) {
      console.error('Verify error:', err);
      return res.status(500).json({ message: 'Token verification failed' });
    }
  }
}