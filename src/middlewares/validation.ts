// src/middleware/validation.ts - Input Validation

import { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
// import { ApiError } from './errorHandler';

// Validation result handler
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages: Record<string, string> = {};
    errors.array().forEach(error => {
      if (error.type === 'field') {
        errorMessages[error.path] = error.msg;
      }
    });
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: errorMessages
    });
  }
  next();
};


// User validation rules
export const validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  body('role')
    .optional()
    .isIn(['ADMIN', 'TEACHER', 'LEARNER'])
    .withMessage('Role must be ADMIN, TEACHER, or LEARNER'),
  handleValidationErrors
];

export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];
// Task validation rules
export const taskValidation = {
  create: [
   
    body('date')
      .isISO8601()
      .withMessage('Valid date is required (YYYY-MM-DD format)'),
    
    body('age')
      .isNumeric()
      .withMessage('Age must be a number')
      .isFloat({ min: 0, max: 150 })
      .withMessage('Age must be between 0-150'),
    
    body('sex')
      .trim()
      .toUpperCase()
      .isIn(['MALE', 'FEMALE', 'OTHER'])
      .withMessage('Sex must be MALE, FEMALE, or OTHER'),
    
    body('uhid')
      .trim()
      .notEmpty()
      .withMessage('UHID is required')
      .isLength({ min: 5, max: 20 })
      .withMessage('UHID must be between 5-20 characters'),
    
    body('chiefComplaint')
      .trim()
      .notEmpty()
      .withMessage('Chief complaint is required')
      .isLength({ max: 1000 })
      .withMessage('Chief complaint cannot exceed 1000 characters'),
    
    body('historyPresenting')
      .trim()
      .notEmpty()
      .withMessage('History of presenting illness is required')
      .isLength({ max: 2000 })
      .withMessage('History cannot exceed 2000 characters'),
    
    body('pastHistory')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Past history cannot exceed 1000 characters'),
    
    body('personalHistory')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Personal history cannot exceed 1000 characters'),
    
    body('familyHistory')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Family history cannot exceed 1000 characters'),
    
    body('clinicalExamination')
      .trim()
      .notEmpty()
      .withMessage('Clinical examination is required')
      .isLength({ max: 2000 })
      .withMessage('Clinical examination cannot exceed 2000 characters'),
    
    body('labExaminations')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Lab examinations cannot exceed 2000 characters'),
    
    body('diagnosis')
      .trim()
      .notEmpty()
      .withMessage('Diagnosis is required')
      .isLength({ max: 1000 })
      .withMessage('Diagnosis cannot exceed 1000 characters'),
    
    body('management')
      .trim()
      .notEmpty()
      .withMessage('Management is required')
      .isLength({ max: 2000 })
      .withMessage('Management cannot exceed 2000 characters'),
    
    body('status')
      .optional()
      .trim()
      .toUpperCase()
      .isIn(['DRAFT', 'SUBMITTED'])
      .withMessage('Status must be DRAFT or SUBMITTED'),
    
    // body('courseId')
    //   .isUUID()
    //   .withMessage('Valid course ID is required'),
    
    body('createdById')
      .optional()
      .isUUID()
      .withMessage('Valid creator ID is required'),
    
    handleValidationErrors
  ],

  update: [
    param('id')
      .isUUID()
      .withMessage('Valid task ID is required'),
    
   
    body('date')
      .optional()
      .isISO8601()
      .withMessage('Valid date is required (YYYY-MM-DD format)'),
    
    body('age')
      .optional()
      .isNumeric()
      .withMessage('Age must be a number')
      .isFloat({ min: 0, max: 150 })
      .withMessage('Age must be between 0-150'),
    
    body('sex')
      .optional()
      .trim()
      .toUpperCase()
      .isIn(['MALE', 'FEMALE', 'OTHER'])
      .withMessage('Sex must be MALE, FEMALE, or OTHER'),
    
    body('uhid')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('UHID cannot be empty')
      .isLength({ min: 5, max: 20 })
      .withMessage('UHID must be between 5-20 characters'),
    
    body('chiefComplaint')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Chief complaint cannot be empty')
      .isLength({ max: 1000 })
      .withMessage('Chief complaint cannot exceed 1000 characters'),
    
    body('historyPresenting')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('History of presenting illness cannot be empty')
      .isLength({ max: 2000 })
      .withMessage('History cannot exceed 2000 characters'),
    
    body('pastHistory')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Past history cannot exceed 1000 characters'),
    
    body('personalHistory')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Personal history cannot exceed 1000 characters'),
    
    body('familyHistory')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Family history cannot exceed 1000 characters'),
    
    body('clinicalExamination')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Clinical examination cannot be empty')
      .isLength({ max: 2000 })
      .withMessage('Clinical examination cannot exceed 2000 characters'),
    
    body('labExaminations')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Lab examinations cannot exceed 2000 characters'),
    
    body('diagnosis')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Diagnosis cannot be empty')
      .isLength({ max: 1000 })
      .withMessage('Diagnosis cannot exceed 1000 characters'),
    
    body('management')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Management cannot be empty')
      .isLength({ max: 2000 })
      .withMessage('Management cannot exceed 2000 characters'),
    
    body('status')
      .optional()
      .trim()
      .toUpperCase()
      .isIn(['DRAFT', 'SUBMITTED', 'RESUBMITTED'])
      .withMessage('Status must be DRAFT, SUBMITTED, or RESUBMITTED'),
    
    // body('courseId')
    //   .optional()
    //   .isUUID()
    //   .withMessage('Valid course ID is required'),
    
    handleValidationErrors
  ],

  approve: [
    param('id')
      .isUUID()
      .withMessage('Valid task ID is required'),
    
    body('comments')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Comments cannot exceed 1000 characters'),
    
    handleValidationErrors
  ],

  reject: [
    param('id')
      .isUUID()
      .withMessage('Valid task ID is required'),
    
    body('rejectionReason')
      .trim()
      .notEmpty()
      .withMessage('Rejection reason is required')
      .isLength({ min: 10, max: 1000 })
      .withMessage('Rejection reason must be between 10-1000 characters'),
    
    handleValidationErrors
  ],

  bulkAction: [
    body('taskIds')
      .isArray({ min: 1 })
      .withMessage('At least one task ID is required'),
    
    body('taskIds.*')
      .isUUID()
      .withMessage('All task IDs must be valid UUIDs'),
    
    body('action')
      .isIn(['approve', 'reject', 'delete'])
      .withMessage('Action must be approve, reject, or delete'),
    
    body('data.rejectionReason')
      .if(body('action').equals('reject'))
      .trim()
      .notEmpty()
      .withMessage('Rejection reason is required for reject action')
      .isLength({ min: 10, max: 1000 })
      .withMessage('Rejection reason must be between 10-1000 characters'),
    
    handleValidationErrors
  ]
};

// User validation rules
export const userValidation = {
  register: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2-100 characters'),
    
    body('email')
      .trim()
      .normalizeEmail()
      .isEmail()
      .withMessage('Valid email is required'),
    
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('role')
      .optional()
      .isIn(['LEARNER', 'TEACHER', 'ADMIN'])
      .withMessage('Role must be LEARNER, TEACHER, or ADMIN'),
    
    handleValidationErrors
  ],

  login: [
    body('email')
      .trim()
      .normalizeEmail()
      .isEmail()
      .withMessage('Valid email is required'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    
    handleValidationErrors
  ]
};

// Course validation rules
export const courseValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Course title is required')
      .isLength({ min: 3, max: 200 })
      .withMessage('Course title must be between 3-200 characters'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),
    
    body('enrollmentNumber')
      .trim()
      .notEmpty()
      .withMessage('Enrollment number is required')
      .isLength({ min: 3, max: 50 })
      .withMessage('Enrollment number must be between 3-50 characters'),
    
    body('facultyName')
      .trim()
      .notEmpty()
      .withMessage('Faculty name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Faculty name must be between 2-100 characters'),
    
    body('teacherId')
      .optional()
      .isUUID()
      .withMessage('Valid teacher ID is required'),
    
    handleValidationErrors
  ],

  update: [
    param('id')
      .isUUID()
      .withMessage('ID is required'),
    
    body('title')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Course title cannot be empty')
      .isLength({ min: 3, max: 200 })
      .withMessage('Course title must be between 3-200 characters'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),
    
    body('enrollmentNumber')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Enrollment number cannot be empty')
      .isLength({ min: 3, max: 50 })
      .withMessage('Enrollment number must be between 3-50 characters'),
    
    body('facultyName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Faculty name cannot be empty')
      .isLength({ min: 2, max: 100 })
      .withMessage('Faculty name must be between 2-100 characters'),
    
    body('teacherId')
      .optional()
      .isUUID()
      .withMessage('Valid teacher ID is required'),
    
    handleValidationErrors
  ]
};

// Query validation
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1-100'),

  handleValidationErrors
];

export const queryValidation = {
  pagination: paginationValidation,

  taskFilters: [
    query('courseId')
      .optional()
      .isUUID()
      .withMessage('Valid course ID is required'),

    query('status')
      .optional()
      .isIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED'])
      .withMessage('Invalid status'),

    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be in YYYY-MM-DD format'),

    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be in YYYY-MM-DD format'),

    query('createdById')
      .optional()
      .isUUID()
      .withMessage('Valid creator ID is required'),

    query('teacherId')
      .optional()
      .isUUID()
      .withMessage('Valid teacher ID is required'),

    ...paginationValidation
  ]
};

// ID parameter validation
export const idValidation = [
  param('id')
    .isUUID()
    .withMessage('Valid ID is required'),
  
  handleValidationErrors
];