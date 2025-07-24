// routes/courseRoutes.ts

import { Router } from 'express';
import {SubmissionController} from '../controllers/submission.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { courseValidation } from '../middlewares/validation';
import { prepareSubmissionData, sendEmailNotification } from '../middlewares/email.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Course CRUD operations
// GET /api/submissions - Get all submissions for teacher
router.get('/', SubmissionController.getSubmissions);

// GET /api/submissions/stats - Get dashboard statistics
router.get('/stats', SubmissionController.getDashboardStats);

// GET /api/submissions/export - Export submissions data
router.get('/export', SubmissionController.exportData);

// GET /api/submissions/:id - Get single submission
router.get('/:id', SubmissionController.getSubmissionById);

// PUT /api/submissions/:id/approve - Approve a case
router.put('/:id/approve', SubmissionController.approveCase);

// PUT /api/submissions/:id/reject - Reject a case
router.put('/:id/reject', SubmissionController.rejectCase);

router.get('/user/:userId', SubmissionController.getAllCasesForUser);

// Get all cases for a specific user with filters
router.get('/user/:userId/filtered', SubmissionController.getAllCasesForUserWithFilters);

// Alternative: Single route with optional query params
router.get('/user/:userId/cases', SubmissionController.getAllCasesForUserWithFilters);

// POST /api/submissions/bulk-approve - Bulk approve cases
router.post('/bulk-approve', SubmissionController.bulkApprove);

export default router;