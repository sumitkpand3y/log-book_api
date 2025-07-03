// controllers/taskController.js
import { Request, Response } from "express";
import prisma from "../models/prisma";
import { z } from "zod";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

// Validation schemas
const createTaskSchema = z.object({
  date: z
    .string()
    .refine((val: string) => !isNaN(Date.parse(val)), "Invalid date format"),
  age: z.union([z.string(), z.number()]).refine((val: string | number) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    return !isNaN(num) && num > 0 && num <= 120;
  }, "Age must be a valid number between 1 and 120"),
  sex: z.enum(["MALE", "FEMALE", "OTHER"], {
    errorMap: () => ({ message: "Sex must be MALE, FEMALE, or OTHER" }),
  }),
  uhid: z.string().min(1, "UHID is required").max(20, "UHID too long"),
  chiefComplaint: z
    .string()
    .min(1, "Chief complaint is required")
    .max(1000, "Chief complaint too long"),
  historyPresenting: z
    .string()
    .min(1, "History of presenting illness is required")
    .max(2000, "History too long"),
  pastHistory: z.string().max(1000, "Past history too long").optional(),
  personalHistory: z.string().max(1000, "Personal history too long").optional(),
  familyHistory: z.string().max(1000, "Family history too long").optional(),
  clinicalExamination: z
    .string()
    .min(1, "Clinical examination is required")
    .max(2000, "Clinical examination too long"),
  labExaminations: z.string().max(2000, "Lab examinations too long").optional(),
  diagnosis: z
    .string()
    .min(1, "Diagnosis is required")
    .max(1000, "Diagnosis too long"),
  management: z
    .string()
    .min(1, "Management is required")
    .max(2000, "Management too long"),
  status: z
    .enum(["DRAFT", "SUBMITTED"], {
      errorMap: () => ({ message: "Status must be DRAFT or SUBMITTED" }),
    })
    .optional(),
  courseId: z.string(),
});

const updateTaskSchema = createTaskSchema.partial().extend({
  status: z
    .enum(["DRAFT", "SUBMITTED", "RESUBMITTED"], {
      errorMap: () => ({
        message: "Status must be DRAFT, SUBMITTED, or RESUBMITTED",
      }),
    })
    .optional(),
});

const queryParamsSchema = z.object({
  courseId: z.string().optional(),
  status: z
    .enum(["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "RESUBMITTED"])
    .optional(),
  page: z
    .string()
    .refine(
      (val: string) => !isNaN(parseInt(val)) && parseInt(val) > 0,
      "Page must be a positive number"
    )
    .optional(),
  limit: z
    .string()
    .refine((val: string) => {
      const num = parseInt(val);
      return !isNaN(num) && num > 0 && num <= 100;
    }, "Limit must be between 1 and 100")
    .optional(),
  startDate: z
    .string()
    .refine(
      (val: string) => !isNaN(Date.parse(val)),
      "Invalid start date format"
    )
    .optional(),
  endDate: z
    .string()
    .refine((val: string) => !isNaN(Date.parse(val)), "Invalid end date format")
    .optional(),
});

const reviewQuerySchema = z.object({
  courseId: z.string().optional(),
  status: z.enum(["SUBMITTED", "RESUBMITTED"]).optional(),
  page: z
    .string()
    .refine(
      (val: string) => !isNaN(parseInt(val)) && parseInt(val) > 0,
      "Page must be a positive number"
    )
    .optional(),
  limit: z
    .string()
    .refine((val: string) => {
      const num = parseInt(val);
      return !isNaN(num) && num > 0 && num <= 100;
    }, "Limit must be between 1 and 100")
    .optional(),
});

const approveTaskSchema = z.object({
  comments: z.string().max(1000, "Comments too long").optional(),
});

const rejectTaskSchema = z.object({
  rejectionReason: z
    .string()
    .min(1, "Rejection reason is required")
    .max(1000, "Rejection reason too long"),
});

// Helper functions
const handlePrismaError = (error: any) => {
  if (error instanceof PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return {
          status: 409,
          message: "A record with this data already exists",
        };
      case "P2025":
        return { status: 404, message: "Record not found" };
      case "P2003":
        return { status: 400, message: "Foreign key constraint failed" };
      case "P2014":
        return { status: 400, message: "Invalid ID provided" };
      default:
        return { status: 500, message: "Database error occurred" };
    }
  }
  return { status: 500, message: "Internal server error" };
};

const validateUUID = (id: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const buildTaskFilters = (query: any, userId: string, userRole: string) => {
  const where: any = {};

  // Role-based filtering
  if (userRole === "LEARNER") {
    where.createdById = userId;
  }

  // Course filtering for teachers
  if (userRole === "TEACHER" && !query.courseId) {
    // This will be handled in the main function
    where._teacherFilter = true;
  }

  if (query.courseId) where.courseId = query.courseId;
  if (query.status) where.status = query.status.toUpperCase();

  // Date range filter
  if (query.startDate || query.endDate) {
    where.date = {};
    if (query.startDate) where.date.gte = new Date(query.startDate);
    if (query.endDate) where.date.lte = new Date(query.endDate);
  }

  return where;
};

export class TaskController {
  // Get all tasks with filtering and pagination
  static getAllTasks = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      // Validate query parameters
      const queryValidation = queryParamsSchema.safeParse(req.query);
      if (!queryValidation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: queryValidation.error.issues.map(
            (issue: { path: any[]; message: any }) => ({
              field: issue.path.join("."),
              message: issue.message,
            })
          ),
        });
      }

      const {
        courseId,
        status,
        page = "1",
        limit = "10",
        startDate,
        endDate,
        search, // Add search parameter
      } = queryValidation.data;

      // Validate pagination parameters
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({
          success: false,
          error: "Invalid page number. Page must be a positive integer.",
        });
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
          success: false,
          error: "Invalid limit. Limit must be between 1 and 100.",
        });
      }

      // Validate user context
      if (!req.user?.userId || !req.user?.role) {
        return res.status(401).json({
          success: false,
          error: "User authentication required",
        });
      }

      let where;
      try {
        where = buildTaskFilters(
          queryValidation.data,
          req.user.userId,
          req.user.role
        );
      } catch (filterError) {
        console.error("Error building task filters:", filterError);
        return res.status(500).json({
          success: false,
          error: "Failed to build query filters",
          ...(process.env.NODE_ENV === "development" && {
            details: filterError.message,
          }),
        });
      }

      // Handle "ALL" status case
      if (status === "ALL") {
        // Remove status filter to get all statuses
        delete where.status;
      }

      // Handle teacher course filtering with error handling
      if (req.user.role === "TEACHER" && where._teacherFilter) {
        delete where._teacherFilter;

        let teacherCourses;
        try {
          teacherCourses = await prisma.course.findMany({
            where: { teacherId: req.user.userId },
            select: { id: true },
          });
        } catch (courseError) {
          console.error("Error fetching teacher courses:", courseError);
          return res.status(500).json({
            success: false,
            error: "Failed to fetch teacher courses",
            ...(process.env.NODE_ENV === "development" && {
              details: courseError.message,
            }),
          });
        }

        if (teacherCourses.length === 0) {
          return res.json({
            success: true,
            data: {
              tasks: [],
              pagination: {
                page: pageNum,
                limit: limitNum,
                total: 0,
                pages: 0,
              },
            },
          });
        }

        // Apply teacher course filter
        where.courseId = {
          in: teacherCourses.map((course: { id: any }) => course.id),
        };
      }

      // Add search functionality with validation
      if (search && typeof search === "string" && search.trim() !== "") {
        const searchTerm = search.trim();

        // Validate search term length
        if (searchTerm.length < 2) {
          return res.status(400).json({
            success: false,
            error: "Search term must be at least 2 characters long",
          });
        }

        if (searchTerm.length > 100) {
          return res.status(400).json({
            success: false,
            error: "Search term cannot exceed 100 characters",
          });
        }

        where.OR = [
          {
            course: {
              title: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
          },
          {
            course: {
              enrollmentNumber: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
          },
          {
            course: {
              facultyName: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
          },
          {
            createdBy: {
              name: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
          },
          {
            createdBy: {
              email: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
          },
          // Add more searchable fields as needed
          {
            description: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        ];
      }

      const skip = (pageNum - 1) * limitNum;

      // Execute database queries with error handling
      let tasks, total;
      try {
        [tasks, total] = await Promise.all([
          prisma.log.findMany({
            where,
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  enrollmentNumber: true,
                  facultyName: true,
                },
              },
              createdBy: {
                select: { id: true, name: true, email: true },
              },
              approvedBy: {
                select: { id: true, name: true, email: true },
              },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limitNum,
          }),
          prisma.log.count({ where }),
        ]);
      } catch (dbError) {
        console.error("Database query error:", dbError);

        // Handle specific Prisma errors
        if (dbError.code === "P2025") {
          return res.status(404).json({
            success: false,
            error: "Related record not found",
          });
        }

        if (dbError.code === "P2002") {
          return res.status(409).json({
            success: false,
            error: "Duplicate entry conflict",
          });
        }

        const { status: errorStatus, message } = handlePrismaError(dbError);
        return res.status(errorStatus).json({
          success: false,
          error: message,
          ...(process.env.NODE_ENV === "development" && {
            details: dbError.message,
          }),
        });
      }

      // Validate results
      if (!Array.isArray(tasks)) {
        return res.status(500).json({
          success: false,
          error: "Invalid data format returned from database",
        });
      }

      return res.json({
        success: true,
        data: {
          tasks,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      console.error("Unexpected error in getAllTasks:", error);

      // Handle different types of errors
      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          ...(process.env.NODE_ENV === "development" && {
            details: error.message,
          }),
        });
      }

      if (error.name === "TimeoutError") {
        return res.status(504).json({
          success: false,
          error: "Request timeout - please try again",
        });
      }

      const { status, message } = handlePrismaError(error);
      return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && {
          details: error.message,
        }),
      });
    }
  };

  // Get single log by ID
  static getTaskById = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Invalid log ID format",
        });
      }

      const log = await prisma.log.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              enrollmentNumber: true,
              facultyName: true,
              teacherId: true,
            },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (!log) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
        });
      }

      // Check permissions
      const canView =
        log.createdById === req.user.userId ||
        log.course.teacherId === req.user.userId ||
        req.user.role === "ADMIN";

      if (!canView) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      return res.json({
        success: true,
        data: log,
      });
    } catch (error) {
      console.error("Error fetching log:", error);
      const { status, message } = handlePrismaError(error);
      return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && {
          details: error.message,
        }),
      });
    }
  };
  private static generateCaseNo = async (courseId: string): string => {
    const currentYear = new Date().getFullYear();

    // Count number of logs created in this course for this year
    const count = await prisma.log.count({
      where: {
        courseId,
        date: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
    });

    // Increment count for new log
    const newIndex = count + 1;

    // Format with padded zeroes
    const paddedIndex = newIndex.toString().padStart(3, "0");

    return `CASE-${currentYear}-${paddedIndex}`;
  };
  // Create new log
  static createTask = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      // 1. Validate the body using Zod
      const validation = createTaskSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const validatedData = validation.data;

      // 2. Check user role
      if (req.user?.role !== "LEARNER") {
        return res.status(403).json({
          success: false,
          error: "Only learners can create tasks",
        });
      }
      // 3. Ensure courseId and userId are defined
      if (!validatedData.courseId || !req.user.userId) {
        return res.status(400).json({
          success: false,
          error: "Missing courseId or user ID",
        });
      }

      // 4. Check if learner is enrolled in the course
      const enrollment = await prisma.courseEnrollment.findFirst({
        where: {
          courseId: validatedData.courseId,
          learnerId: req.user.userId,
        },
      });

      if (!enrollment) {
        return res.status(403).json({
          success: false,
          error: "You are not enrolled in this course",
        });
      }

      const caseNo = await this.generateCaseNo(validatedData.courseId);

      // 5. Check for duplicate caseNo
      const existingTask = await prisma.log.findUnique({
        where: { caseNo: caseNo },
      });

      if (existingTask) {
        return res.status(409).json({
          success: false,
          error: "Case number already exists",
          field: "caseNo",
        });
      }

      // 6. Build task data safely
      const taskData = {
        caseNo: caseNo,
        date: new Date(validatedData.date),
        age:
          typeof validatedData.age === "string"
            ? parseFloat(validatedData.age)
            : validatedData.age,
        sex: validatedData.sex,
        uhid: validatedData.uhid,
        chiefComplaint: validatedData.chiefComplaint,
        historyPresenting: validatedData.historyPresenting,
        pastHistory: validatedData.pastHistory || "",
        personalHistory: validatedData.personalHistory || "",
        familyHistory: validatedData.familyHistory || "",
        clinicalExamination: validatedData.clinicalExamination,
        labExaminations: validatedData.labExaminations || "",
        diagnosis: validatedData.diagnosis,
        management: validatedData.management,
        status: validatedData.status ?? "DRAFT",
        courseId: validatedData.courseId,
        createdById: req.user?.userId,
        submittedAt:
          validatedData.status === "SUBMITTED" ? new Date() : undefined,
      };

      // 7. Create task in DB
      const log = await prisma.log.create({
        data: taskData,
        include: {
          course: {
            select: {
              title: true,
              enrollmentNumber: true,
              facultyName: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // 8. Return success
      return res.status(201).json({
        success: true,
        data: log,
        message: "Task created successfully",
      });
    } catch (error) {
      console.error("Error creating task:", error);
      const { status, message } = handlePrismaError(error);
      return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && {
          details: error.message,
        }),
      });
    }
  };

  // Update existing log
  static updateTask = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Invalid log ID format",
        });
      }
      // Validate request body
      const validation = updateTaskSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: validation.error.issues.map(
            (issue: { path: any[]; message: any }) => ({
              field: issue.path.join("."),
              message: issue.message,
            })
          ),
        });
      }

      const validatedData = validation.data;

      // Check if log exists and user has permission
      const existingTask = await prisma.log.findUnique({
        where: { id },
        include: { course: true },
      });

      if (!existingTask) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
        });
      }

      // Only creator can update their tasks
      if (existingTask.createdById !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      // Can't update approved tasks
      if (existingTask.status === "APPROVED") {
        return res.status(400).json({
          success: false,
          error: "Cannot update approved tasks",
        });
      }

      // Check case number uniqueness if changed
      if (
        validatedData.caseNo &&
        validatedData.caseNo !== existingTask.caseNo
      ) {
        const duplicateCase = await prisma.log.findUnique({
          where: { caseNo: validatedData.caseNo },
        });

        if (duplicateCase) {
          return res.status(409).json({
            success: false,
            error: "Case number already exists",
            field: "caseNo",
          });
        }
      }

      const updateData: any = {};

      // Only update provided fields
      if (validatedData.caseNo !== undefined)
        updateData.caseNo = validatedData.caseNo;
      if (validatedData.date !== undefined)
        updateData.date = new Date(validatedData.date);
      if (validatedData.age !== undefined) {
        updateData.age =
          typeof validatedData.age === "string"
            ? parseFloat(validatedData.age)
            : validatedData.age;
      }
      if (validatedData.sex !== undefined) updateData.sex = validatedData.sex;
      if (validatedData.uhid !== undefined)
        updateData.uhid = validatedData.uhid;
      if (validatedData.chiefComplaint !== undefined)
        updateData.chiefComplaint = validatedData.chiefComplaint;
      if (validatedData.historyPresenting !== undefined)
        updateData.historyPresenting = validatedData.historyPresenting;
      if (validatedData.pastHistory !== undefined)
        updateData.pastHistory = validatedData.pastHistory;
      if (validatedData.personalHistory !== undefined)
        updateData.personalHistory = validatedData.personalHistory;
      if (validatedData.familyHistory !== undefined)
        updateData.familyHistory = validatedData.familyHistory;
      if (validatedData.clinicalExamination !== undefined)
        updateData.clinicalExamination = validatedData.clinicalExamination;
      if (validatedData.labExaminations !== undefined)
        updateData.labExaminations = validatedData.labExaminations;
      if (validatedData.diagnosis !== undefined)
        updateData.diagnosis = validatedData.diagnosis;
      if (validatedData.management !== undefined)
        updateData.management = validatedData.management;
      if (validatedData.courseId !== undefined)
        updateData.courseId = validatedData.courseId;

      // Handle status changes
      if (validatedData.status !== existingTask.status) {
        updateData.status = validatedData.status;

        if (validatedData.status === "SUBMITTED") {
          updateData.submittedAt = new Date();
        } else if (validatedData.status === "RESUBMITTED") {
          updateData.submittedAt = new Date();
          updateData.rejectionReason = null;
        } else if (validatedData.status === "DRAFT") {
          // Optional: clear submittedAt if going back to draft
          updateData.submittedAt = null;
        }
      }
      const updatedTask = await prisma.log.update({
        where: { id },
        data: updateData,
        include: {
          course: {
            select: { title: true, enrollmentNumber: true, facultyName: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return res.json({
        success: true,
        data: updatedTask,
        message: "Task updated successfully",
      });
    } catch (error) {
      console.error("Error updating log:", error);
      const { status, message } = handlePrismaError(error);
      return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && {
          details: error.message,
        }),
      });
    }
  };

  // Delete log
  static deleteTask = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!validateUUID(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid log ID format",
        });
      }

      const log = await prisma.log.findUnique({
        where: { id },
      });

      if (!log) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
        });
      }

      // Only creator can delete draft tasks
      if (log.createdById !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      if (log.status !== "DRAFT") {
        return res.status(400).json({
          success: false,
          error: "Can only delete draft tasks",
        });
      }

      await prisma.log.delete({
        where: { id },
      });

      return res.json({
        success: true,
        message: "Task deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting log:", error);
      const { status, message } = handlePrismaError(error);
      return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && {
          details: error.message,
        }),
      });
    }
  };

  // Approve log (Teachers only)
  static approveTask = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!validateUUID(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid log ID format",
        });
      }

      // Validate request body
      const validation = approveTaskSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: validation.error.issues.map(
            (issue: { path: any[]; message: any }) => ({
              field: issue.path.join("."),
              message: issue.message,
            })
          ),
        });
      }

      const log = await prisma.log.findUnique({
        where: { id },
        include: { course: true },
      });

      if (!log) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
        });
      }

      // Check if user is teacher of the course
      if (log.course.teacherId !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: "Only course teacher can approve tasks",
        });
      }

      // Can only approve submitted/resubmitted tasks
      if (!["SUBMITTED", "RESUBMITTED"].includes(log.status)) {
        return res.status(400).json({
          success: false,
          error: "Can only approve submitted or resubmitted tasks",
        });
      }

      const approvedTask = await prisma.log.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: req.user.userId,
          approvedAt: new Date(),
          rejectionReason: null,
        },
        include: {
          course: {
            select: { title: true, enrollmentNumber: true, facultyName: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return res.json({
        success: true,
        data: approvedTask,
        message: "Task approved successfully",
      });
    } catch (error) {
      console.error("Error approving log:", error);
      const { status, message } = handlePrismaError(error);
      return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && {
          details: error.message,
        }),
      });
    }
  };

  // Reject log (Teachers only)
  static rejectTask = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!validateUUID(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid log ID format",
        });
      }

      // Validate request body
      const validation = rejectTaskSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: validation.error.issues.map(
            (issue: { path: any[]; message: any }) => ({
              field: issue.path.join("."),
              message: issue.message,
            })
          ),
        });
      }

      const { rejectionReason } = validation.data;

      const log = await prisma.log.findUnique({
        where: { id },
        include: { course: true },
      });

      if (!log) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
        });
      }

      // Check if user is teacher of the course
      if (log.course.teacherId !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: "Only course teacher can reject tasks",
        });
      }

      // Can only reject submitted/resubmitted tasks
      if (!["SUBMITTED", "RESUBMITTED"].includes(log.status)) {
        return res.status(400).json({
          success: false,
          error: "Can only reject submitted or resubmitted tasks",
        });
      }

      const rejectedTask = await prisma.log.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionReason: rejectionReason.trim(),
          rejectedAt: new Date(),
          approvedById: req.user.userId,
        },
        include: {
          course: {
            select: { title: true, enrollmentNumber: true, facultyName: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return res.json({
        success: true,
        data: rejectedTask,
        message: "Task rejected successfully",
      });
    } catch (error) {
      console.error("Error rejecting log:", error);
      const { status, message } = handlePrismaError(error);
      return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && {
          details: error.message,
        }),
      });
    }
  };

  // Get tasks for teacher review
  static getTasksForReview = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      // Validate query parameters
      const validation = reviewQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: validation.error.issues.map(
            (issue: { path: any[]; message: any }) => ({
              field: issue.path.join("."),
              message: issue.message,
            })
          ),
        });
      }

      const {
        courseId,
        status = "SUBMITTED",
        page = "1",
        limit = "10",
      } = validation.data;

      // Only teachers can access this endpoint
      if (req.user.role !== "TEACHER") {
        return res.status(403).json({
          success: false,
          error: "Only teachers can access tasks for review",
        });
      }

      // Get teacher's courses
      const teacherCourses = await prisma.course.findMany({
        where: { teacherId: req.user.userId },
        select: { id: true },
      });

      if (teacherCourses.length === 0) {
        return res.json({
          success: true,
          data: {
            tasks: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0,
            },
          },
        });
      }

      const where: any = {
        courseId: courseId || {
          in: teacherCourses.map((course: { id: any }) => course.id),
        },
        status: status,
      };

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [tasks, total] = await Promise.all([
        prisma.log.findMany({
          where,
          include: {
            course: {
              select: {
                id: true,
                title: true,
                enrollmentNumber: true,
                facultyName: true,
              },
            },
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { submittedAt: "asc" },
          skip,
          take: parseInt(limit),
        }),
        prisma.log.count({ where }),
      ]);

      return res.json({
        success: true,
        data: {
          tasks,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching tasks for review:", error);
      const { status, message } = handlePrismaError(error);
      return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && {
          details: error.message,
        }),
      });
    }
  };
}

export default TaskController;
