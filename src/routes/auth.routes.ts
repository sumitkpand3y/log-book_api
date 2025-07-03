// routes/authRoutes.ts

import { Router } from 'express';
import {AuthController} from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { 
  validateRegister, 
  validateLogin, 
} from '../middlewares/validation';

const router = Router();

// Public routes
router.post('/register', validateRegister, AuthController.register);
router.post('/login', validateLogin, AuthController.login);

// Protected routes
router.use(authenticate);
// router.get('/profile', AuthController.getProfile);

export default router;