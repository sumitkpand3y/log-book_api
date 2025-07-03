// controllers/taskController.js
import { Request, Response } from "express";
import prisma from "../models/prisma";

export class TaskController {
  // Get all tasks with filtering and pagination
  static getAllTasks= async (req: Request, res: Response) => {
    try {
      const { 
        courseId, 
        status, 
        page = 1, 
        limit = 10,
        startDate,
        endDate 
      } = req.query;
      
      const where = {};
      
      // If user is learner, only show their tasks
      if (req.user.role === 'LEARNER') {
        where.createdById = req.user.id;
      }
      
      // If user is teacher, show tasks from their courses
      if (req.user.role === 'TEACHER' && !courseId) {
        const teacherCourses = await prisma.course.findMany({
          where: { teacherId: req.user.id },
          select: { id: true }
        });
        where.courseId = {
          in: teacherCourses.map(course => course.id)
        };
      }
      
      if (courseId) where.courseId = courseId;
      if (status) where.status = status.toUpperCase();
      
      // Date range filter
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate);
        if (endDate) where.date.lte = new Date(endDate);
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where,
          include: {
            course: {
              select: {
                id: true,
                title: true,
                enrollmentNumber: true,
                facultyName: true
              }
            },
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            approvedBy: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        prisma.task.count({ where })
      ]);
      
      res.json({
        success: true,
        data: {
          tasks,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch tasks',
        message: error.message
      });
    }
  }

  // Get single task by ID
  static getTaskById= async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const task = await prisma.task.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              enrollmentNumber: true,
              facultyName: true,
              teacherId: true
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      
      if (!task) {
        return res.status(404).json({ 
          success: false,
          error: 'Task not found' 
        });
      }
      
      // Check permissions
      const canView = 
        task.createdById === req.user.id || // Task creator
        task.course.teacherId === req.user.id || // Course teacher
        req.user.role === 'ADMIN'; // Admin
      
      if (!canView) {
        return res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
      }
      
      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      console.error('Error fetching task:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch task',
        message: error.message
      });
    }
  }

  // Create new task
  static createTask= async (req: Request, res: Response) => {
    try {
      const {
        caseNo,
        date,
        age,
        sex,
        uhid,
        chiefComplaint,
        historyPresenting,
        pastHistory,
        personalHistory,
        familyHistory,
        clinicalExamination,
        labExaminations,
        diagnosis,
        management,
        status = 'DRAFT',
        courseId
      } = req.body;
      
      // Check if case number already exists
      const existingTask = await prisma.task.findUnique({
        where: { caseNo }
      });
      
      if (existingTask) {
        return res.status(400).json({ 
          success: false,
          errors: { caseNo: 'Case number already exists' }
        });
      }
      
      // Verify course enrollment
      const enrollment = await prisma.courseEnrollment.findFirst({
        where: {
          courseId,
          learnerId: req.user.id
        }
      });
      
      if (!enrollment) {
        return res.status(403).json({ 
          success: false,
          error: 'Not enrolled in this course' 
        });
      }
      
      const taskData = {
        caseNo,
        date: new Date(date),
        age: parseFloat(age),
        sex: sex.toUpperCase(),
        uhid,
        chiefComplaint,
        historyPresenting,
        pastHistory,
        personalHistory,
        familyHistory,
        clinicalExamination,
        labExaminations,
        diagnosis,
        management,
        status: status.toUpperCase(),
        courseId,
        createdById: req.user.id
      };
      
      // Set timestamps based on status
      if (status.toUpperCase() === 'SUBMITTED') {
        taskData.submittedAt = new Date();
      }
      
      const task = await prisma.task.create({
        data: taskData,
        include: {
          course: {
            select: {
              title: true,
              enrollmentNumber: true,
              facultyName: true
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      
      res.status(201).json({
        success: true,
        data: task,
        message: 'Task created successfully'
      });
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to create task',
        message: error.message
      });
    }
  }

  // Update existing task
  static updateTask= async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        caseNo,
        date,
        age,
        sex,
        uhid,
        chiefComplaint,
        historyPresenting,
        pastHistory,
        personalHistory,
        familyHistory,
        clinicalExamination,
        labExaminations,
        diagnosis,
        management,
        status,
        courseId
      } = req.body;
      
      // Check if task exists and user has permission
      const existingTask = await prisma.task.findUnique({
        where: { id },
        include: { course: true }
      });
      
      if (!existingTask) {
        return res.status(404).json({ 
          success: false,
          error: 'Task not found' 
        });
      }
      
      // Only creator can update draft/rejected tasks
      if (existingTask.createdById !== req.user.id) {
        return res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
      }
      
      // Can't update approved tasks
      if (existingTask.status === 'APPROVED') {
        return res.status(400).json({ 
          success: false,
          error: 'Cannot update approved tasks' 
        });
      }
      
      // Check case number uniqueness if changed
      if (caseNo && caseNo !== existingTask.caseNo) {
        const duplicateCase = await prisma.task.findUnique({
          where: { caseNo }
        });
        
        if (duplicateCase) {
          return res.status(400).json({ 
            success: false,
            errors: { caseNo: 'Case number already exists' }
          });
        }
      }
      
      const updateData = {
        caseNo,
        date: date ? new Date(date) : undefined,
        age: age ? parseFloat(age) : undefined,
        sex: sex ? sex.toUpperCase() : undefined,
        uhid,
        chiefComplaint,
        historyPresenting,
        pastHistory,
        personalHistory,
        familyHistory,
        clinicalExamination,
        labExaminations,
        diagnosis,
        management,
        courseId
      };
      
      // Handle status changes
      if (status) {
        updateData.status = status.toUpperCase();
        
        if (status.toUpperCase() === 'SUBMITTED') {
          updateData.submittedAt = new Date();
        } else if (status.toUpperCase() === 'RESUBMITTED') {
          updateData.submittedAt = new Date();
          updateData.rejectionReason = null;
        }
      }
      
      // Remove undefined values
      Object.keys(updateData).forEach(key => 
        updateData[key] === undefined && delete updateData[key]
      );
      
      const updatedTask = await prisma.task.update({
        where: { id },
        data: updateData,
        include: {
          course: {
            select: {
              title: true,
              enrollmentNumber: true,
              facultyName: true
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      
      res.json({
        success: true,
        data: updatedTask,
        message: 'Task updated successfully'
      });
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to update task',
        message: error.message
      });
    }
  }

  // Delete task
  static deleteTask= async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const task = await prisma.task.findUnique({
        where: { id }
      });
      
      if (!task) {
        return res.status(404).json({ 
          success: false,
          error: 'Task not found' 
        });
      }
      
      // Only creator can delete draft tasks
      if (task.createdById !== req.user.id || task.status !== 'DRAFT') {
        return res.status(403).json({ 
          success: false,
          error: 'Can only delete draft tasks you created' 
        });
      }
      
      await prisma.task.delete({
        where: { id }
      });
      
      res.json({
        success: true,
        message: 'Task deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to delete task',
        message: error.message
      });
    }
  }

  // Approve task (Teachers only)
  static approveTask= async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { comments } = req.body;
      
      const task = await prisma.task.findUnique({
        where: { id },
        include: { course: true }
      });
      
      if (!task) {
        return res.status(404).json({ 
          success: false,
          error: 'Task not found' 
        });
      }
      
      // Check if user is teacher of the course
      if (task.course.teacherId !== req.user.id) {
        return res.status(403).json({ 
          success: false,
          error: 'Only course teacher can approve tasks' 
        });
      }
      
      // Can only approve submitted/resubmitted tasks
      if (!['SUBMITTED', 'RESUBMITTED'].includes(task.status)) {
        return res.status(400).json({ 
          success: false,
          error: 'Can only approve submitted tasks' 
        });
      }
      
      const approvedTask = await prisma.task.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: req.user.id,
          approvedAt: new Date(),
          rejectionReason: null
        },
        include: {
          course: {
            select: {
              title: true,
              enrollmentNumber: true,
              facultyName: true
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      
      res.json({
        success: true,
        data: approvedTask,
        message: 'Task approved successfully'
      });
    } catch (error) {
      console.error('Error approving task:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to approve task',
        message: error.message
      });
    }
  }

  // Reject task (Teachers only)
  static rejectTask= async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rejectionReason } = req.body;
      
      if (!rejectionReason?.trim()) {
        return res.status(400).json({ 
          success: false,
          error: 'Rejection reason is required' 
        });
      }
      
      const task = await prisma.task.findUnique({
        where: { id },
        include: { course: true }
      });
      
      if (!task) {
        return res.status(404).json({ 
          success: false,
          error: 'Task not found' 
        });
      }
      
      // Check if user is teacher of the course
      if (task.course.teacherId !== req.user.id) {
        return res.status(403).json({ 
          success: false,
          error: 'Only course teacher can reject tasks' 
        });
      }
      
      // Can only reject submitted/resubmitted tasks
      if (!['SUBMITTED', 'RESUBMITTED'].includes(task.status)) {
        return res.status(400).json({ 
          success: false,
          error: 'Can only reject submitted tasks' 
        });
      }
      
      const rejectedTask = await prisma.task.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
          rejectedAt: new Date(),
          approvedById: req.user.id // Track who rejected it
        },
        include: {
          course: {
            select: {
              title: true,
              enrollmentNumber: true,
              facultyName: true
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      
      res.json({
        success: true,
        data: rejectedTask,
        message: 'Task rejected successfully'
      });
    } catch (error) {
      console.error('Error rejecting task:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to reject task',
        message: error.message
      });
    }
  }

  // Get tasks for teacher review
  static getTasksForReview= async (req: Request, res: Response) => {
    try {
      const { 
        courseId, 
        status = 'SUBMITTED', 
        page = 1, 
        limit = 10 
      } = req.query;
      
      // Get teacher's courses
      const teacherCourses = await prisma.course.findMany({
        where: { teacherId: req.user.id },
        select: { id: true }
      });
      
      if (teacherCourses.length === 0) {
        return res.json({
          success: true,
          data: {
            tasks: [],
            pagination: {
              page: 1,
              limit: parseInt(limit),
              total: 0,
              pages: 0
            }
          }
        });
      }
      
      const where = {
        courseId: courseId ? courseId : {
          in: teacherCourses.map(course => course.id)
        },
        status: status.toUpperCase()
      };
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where,
          include: {
            course: {
              select: {
                id: true,
                title: true,
                enrollmentNumber: true,
                facultyName: true
              }
            },
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: { submittedAt: 'asc' },
          skip,
          take: parseInt(limit)
        }),
        prisma.task.count({ where })
      ]);
      
      res.json({
        success: true,
        data: {
          tasks,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('Error fetching tasks for review:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch tasks for review',
        message: error.message
      });
    }
  }
}

// module.exports = TaskController;