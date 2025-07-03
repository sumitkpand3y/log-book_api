// routes/courseRoutes.ts

import { Router } from 'express';
import CourseController from '../controllers/course.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { courseValidation } from '../middlewares/validation';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Course CRUD operations
router.get('/', CourseController.getAllCourses);
router.get('/enrolled', CourseController.getEnrolledCourses);
router.get('/:id', CourseController.getCourseById);
router.post('/', courseValidation.create, CourseController.createCourse);
router.put('/:id', courseValidation.update, CourseController.updateCourse);
router.delete('/:id', CourseController.deleteCourse);

// Enrollment operations
router.post('/enroll', CourseController.enrollInCourse);
router.delete('/:courseId/unenroll', CourseController.unenrollFromCourse);

// Course management (Teachers and Admins)
router.get('/:id/enrollments', CourseController.getCourseEnrollments);

export default router;