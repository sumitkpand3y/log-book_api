import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

// Custom error classes for better error handling
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

// Types for better type safety
interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    [key: string]: any;
  };
}

interface SubmissionFilters {
  search?: string;
  status?: string;
  department?: string;
  priority?: string;
  startDate?: string;
  endDate?: string;
  page?: string;
  limit?: string;
}

export class SubmissionController {
  // Helper method for consistent error responses
  private static handleError(error: Error, res: Response): Response {
    console.error("Controller Error:", error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errorType: "VALIDATION_ERROR",
      });
    }

    if (error instanceof NotFoundError) {
      return res.status(404).json({
        success: false,
        message: error.message,
        errorType: "NOT_FOUND",
      });
    }

    if (error instanceof UnauthorizedError) {
      return res.status(403).json({
        success: false,
        message: error.message,
        errorType: "UNAUTHORIZED",
      });
    }

    // Prisma-specific errors
    if (error.name === "PrismaClientKnownRequestError") {
      return res.status(400).json({
        success: false,
        message: "Database operation failed",
        errorType: "DATABASE_ERROR",
      });
    }

    if (error.name === "PrismaClientValidationError") {
      return res.status(400).json({
        success: false,
        message: "Invalid data provided",
        errorType: "VALIDATION_ERROR",
      });
    }

    // Generic server error
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      errorType: "INTERNAL_ERROR",
    });
  }

  private static getPriority = (log: any): string => {
    // You can customize this logic based on your requirements
    const now = new Date();
    const dueDate = log.course?.endDate ? new Date(log.course.endDate) : null;

    if (!dueDate) return "medium";

    const timeDiff = dueDate.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    if (daysDiff <= 1) return "high";
    if (daysDiff <= 7) return "medium";
    return "low";
  };

  // Validate pagination parameters
  private static validatePagination(page?: string, limit?: string) {
    const pageNum = parseInt(page || "1");
    const limitNum = parseInt(limit || "14");

    if (isNaN(pageNum) || pageNum < 1) {
      throw new ValidationError("Page must be a positive integer");
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new ValidationError("Limit must be between 1 and 100");
    }

    return { page: pageNum, limit: limitNum };
  }

  // Validate date range
  private static validateDateRange(startDate?: string, endDate?: string) {
    if (startDate && !isValidDate(startDate)) {
      throw new ValidationError("Invalid start date format");
    }

    if (endDate && !isValidDate(endDate)) {
      throw new ValidationError("Invalid end date format");
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      throw new ValidationError("Start date cannot be after end date");
    }
  }

  // Get all submissions for teacher dashboard
  static getSubmissions = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const {
      search,
      status,
      department,
      priority,
      startDate,
      endDate,
      page,
      limit,
    } = req.query as SubmissionFilters;

    // Validate user authentication
    if (!req.user?.userId) {
      throw new UnauthorizedError("User not authenticated");
    }

    const teacherId = req.user.userId;

    // Validate pagination
    const { page: pageNum, limit: limitNum } = this.validatePagination(
      page,
      limit
    );

    // Validate date range
    this.validateDateRange(startDate, endDate);

    // Get all course IDs where this user is a teacher (either directly or through courseTeachers)
    const teacherCourses = await prisma.course.findMany({
      where: {
        OR: [
          { teacherId: teacherId }, // Direct teacher assignment
          { 
            courseTeachers: {
              some: {
                teacherId: teacherId
              }
            }
          } // Through courseTeachers relation
        ]
      },
      select: {
        id: true
      }
    });
    console.log("teacherCourses", teacherCourses);
    

    const courseIds = teacherCourses.map(course => course.id);
    
    console.log("courseIds", courseIds);
    
    if (courseIds.length === 0) {
      // Return empty response if teacher has no courses
      return res.json({
        success: true,
        data: {
          submissions: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0,
          },
        },
      });
    }

    // Build where clause with proper typing
    const where: any = {
      courseId: {
        in: courseIds // Only include logs from courses this teacher is associated with
      }
    };

    // Add filters with validation
    if (status && status !== "ALL") {
      const validStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "RESUBMITTED"];
      if (!validStatuses.includes(status.toUpperCase())) {
        throw new ValidationError(
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`
        );
      }
      where.status = status.toUpperCase();
    }

    if (search && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        {
          createdBy: {
            name: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        },
        {
          course: {
            title: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        },
        {
          caseNo: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
      ];
    }

    if (department) {
      where.course = {
        ...where.course,
        facultyName: {
          contains: department,
          mode: "insensitive",
        },
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Get submissions with pagination
    const [logs, total] = await Promise.all([
      prisma.log.findMany({
        where:{
          ...where,
          NOT: { status: 'DRAFT' },
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              name: true,
              facultyName: true,
              hospitalName: true,
              endDate: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { status: "asc" }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.log.count({ where }),
    ]);
    
    // Group logs by learner and course to create submissions
    const submissionMap = new Map();

    logs.forEach((log) => {
      const key = `${log.createdById}-${log.courseId}`;

      if (!submissionMap.has(key)) {
        submissionMap.set(key, {
          id: log.createdById || log.id,
          learnerName: log.createdBy?.name || "Unknown",
          learnerId: log.createdById || null,
          taskTitle: log.course?.title || "Unknown Course",
          submissionDate: log.submittedAt || log.createdAt,
          dueDate: log.course?.endDate || null,
          department: log.course?.facultyName || "Unknown",
          priority: this.getPriority(log),
          cases: [],
          courseId: log.courseId || null,
        });
      }

      // Add case to the submission
      const submission = submissionMap.get(key);
      submission.cases.push({
        id: log.id,
        caseNo: log.caseNo || `CASE-${log.id}`,
        date: log.date
          ? new Date(log.date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        age: log.age || null,
        sex: log.sex || null,
        uhid: log.uhid || null,
        chiefComplaint: log.chiefComplaint || null,
        historyPresenting: log.historyPresenting || null,
        pastHistory: log.pastHistory || null,
        personalHistory: log.personalHistory || null,
        familyHistory: log.familyHistory || null,
        clinicalExamination: log.clinicalExamination || null,
        labExaminations: log.labExaminations || null,
        diagnosis: log.diagnosis || null,
        management: log.management || null,
        status: log.status || "Submitted",
        rejectionReason: log.rejectionReason || "",
        courseId: log.courseId || null,
      });
    });

    // Convert map to array and calculate submission statistics
    const transformedSubmissions = Array.from(submissionMap.values()).map(
      (submission) => {
        const cases = submission.cases;
        const totalCases = cases.length;
        const approvedCases = cases.filter(
          (c) => c.status === "APPROVED"
        ).length;
        const rejectedCases = cases.filter(
          (c) => c.status === "REJECTED"
        ).length;
        const submittedCases = cases.filter(
          (c) => c.status === "SUBMITTED" || c.status === "RESUBMITTED"
        ).length;
        const pendingCases = submittedCases; // Submitted cases are pending review

        // Determine overall status
        let overallStatus;
        if (rejectedCases > 0) {
          overallStatus = "rejected";
        } else if (pendingCases > 0) {
          overallStatus = "pending";
        } else if (approvedCases === totalCases && totalCases > 0) {
          overallStatus = "approved";
        } else {
          overallStatus = "draft";
        }

        return {
          ...submission,
          status: overallStatus,
          totalCases,
          approvedCases,
          rejectedCases,
          pendingCases,
          completedCases: approvedCases,
          // Format dates to match frontend expectations
          submissionDate: submission.submissionDate
            ? new Date(submission.submissionDate).toISOString()
            : null,
          dueDate: submission.dueDate
            ? new Date(submission.dueDate).toISOString()
            : null,
        };
      }
    );

    return res.json({
      success: true,
      data: {
        submissions: transformedSubmissions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    return this.handleError(error as Error, res);
  }
};
  // static getSubmissions = async (
  //   req: Request,
  //   res: Response
  // ): Promise<Response> => {
  //   try {
  //     const {
  //       search,
  //       status,
  //       department,
  //       priority,
  //       startDate,
  //       endDate,
  //       page,
  //       limit
  //     } = req.query as SubmissionFilters;

  //     // Validate user authentication
  //     if (!req.user?.userId) {
  //       throw new UnauthorizedError('User not authenticated');
  //     }

  //     const teacherId = req.user.userId;

  //     // Validate pagination
  //     const { page: pageNum, limit: limitNum } = this.validatePagination(page, limit);

  //     // Validate date range
  //     this.validateDateRange(startDate, endDate);

  //     // Build where clause with proper typing
  //     const where: any = {
  //       course: {
  //         teacherId: teacherId
  //       }
  //     };

  //     // Add filters with validation
  //     if (status && status !== 'all') {
  //       const validStatuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];
  //       if (!validStatuses.includes(status.toUpperCase())) {
  //         throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  //       }
  //       where.status = status.toUpperCase();
  //     }

  //     if (search && search.trim()) {
  //       const searchTerm = search.trim();
  //       where.OR = [
  //         {
  //           createdBy: {
  //             name: {
  //               contains: searchTerm,
  //               mode: 'insensitive'
  //             }
  //           }
  //         },
  //         {
  //           course: {
  //             title: {
  //               contains: searchTerm,
  //               mode: 'insensitive'
  //             }
  //           }
  //         },
  //         {
  //           caseNo: {
  //             contains: searchTerm,
  //             mode: 'insensitive'
  //           }
  //         }
  //       ];
  //     }

  //     if (startDate || endDate) {
  //       where.createdAt = {};
  //       if (startDate) where.createdAt.gte = new Date(startDate);
  //       if (endDate) where.createdAt.lte = new Date(endDate);
  //     }

  //     // Get submissions with pagination
  //     const [submissions, total] = await Promise.all([
  //       prisma.log.findMany({
  //         where,
  //         include: {
  //           createdBy: {
  //             select: {
  //               id: true,
  //               name: true,
  //               email: true
  //             }
  //           },
  //           course: {
  //             select: {
  //               id: true,
  //               title: true,
  //               name: true,
  //               facultyName: true,
  //               hospitalName: true,
  //               endDate: true
  //             }
  //           },
  //           approvedBy: {
  //             select: {
  //               id: true,
  //               name: true,
  //               email: true
  //             }
  //           }
  //         },
  //         orderBy: [
  //           { createdAt: 'desc' },
  //           { status: 'asc' }
  //         ],
  //         skip: (pageNum - 1) * limitNum,
  //         take: limitNum
  //       }),
  //       prisma.log.count({ where })
  //     ]);

  //     // Transform data to match frontend expectations
  //     const transformedSubmissions = submissions.map(log => ({
  //       id: log.id,
  //       learnerName: log.createdBy?.name || 'Unknown',
  //       learnerId: log.createdBy?.id || null,
  //       learnerEmail: log.createdBy?.email || null,
  //       taskTitle: log.course?.title || 'Unknown Course',
  //       courseName: log.course?.name || 'Unknown',
  //       department: log.course?.facultyName || 'Unknown',
  //       hospitalName: log.course?.hospitalName || 'Unknown',
  //       submissionDate: log.submittedAt || log.createdAt,
  //       dueDate: log.course?.endDate || null,
  //       status: log.status?.toLowerCase() || 'unknown',
  //       priority: getPriority(log),
  //       caseDetails: {
  //         caseNo: log.caseNo || null,
  //         date: log.date || null,
  //         age: log.age || null,
  //         sex: log.sex || null,
  //         uhid: log.uhid || null,
  //         chiefComplaint: log.chiefComplaint || null,
  //         historyPresenting: log.historyPresenting || null,
  //         pastHistory: log.pastHistory || null,
  //         personalHistory: log.personalHistory || null,
  //         familyHistory: log.familyHistory || null,
  //         clinicalExamination: log.clinicalExamination || null,
  //         labExaminations: log.labExaminations || null,
  //         diagnosis: log.diagnosis || null,
  //         management: log.management || null,
  //         rejectionReason: log.rejectionReason || null,
  //         teacherComments: log.teacherComments || null
  //       },
  //       timestamps: {
  //         createdAt: log.createdAt,
  //         updatedAt: log.updatedAt,
  //         submittedAt: log.submittedAt || null,
  //         approvedAt: log.approvedAt || null,
  //         rejectedAt: log.rejectedAt || null
  //       },
  //       approvedBy: log.approvedBy || null
  //     }));

  //     return res.json({
  //       success: true,
  //       data: {
  //         submissions: transformedSubmissions,
  //         pagination: {
  //           page: pageNum,
  //           limit: limitNum,
  //           total,
  //           totalPages: Math.ceil(total / limitNum)
  //         }
  //       }
  //     });

  //   } catch (error) {
  //     return this.handleError(error as Error, res);
  //   }
  // };

  // Get single submission by ID
  static getSubmissionById = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;

      // Validate user authentication
      if (!req.user?.userId) {
        throw new UnauthorizedError("User not authenticated");
      }

      // Validate ID parameter
      if (!id || id.trim() === "") {
        throw new ValidationError("Submission ID is required");
      }

      const teacherId = req.user.userId;

      const submission = await prisma.log.findFirst({
        where: {
          id: id.trim(),
          course: {
            teacherId: teacherId,
          },
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              name: true,
              facultyName: true,
              hospitalName: true,
              location: true,
              contactProgram: true,
              endDate: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!submission) {
        throw new NotFoundError(
          "Submission not found or you do not have permission to view it"
        );
      }

      const transformedSubmission = {
        id: submission.id,
        learnerName: submission.createdBy?.name || "Unknown",
        learnerId: submission.createdBy?.id || null,
        learnerEmail: submission.createdBy?.email || null,
        taskTitle: submission.course?.title || "Unknown Course",
        courseName: submission.course?.name || "Unknown",
        department: submission.course?.facultyName || "Unknown",
        hospitalName: submission.course?.hospitalName || "Unknown",
        status: submission.status?.toLowerCase() || "unknown",
        priority: getPriority(submission),
        caseDetails: {
          caseNo: submission.caseNo || null,
          date: submission.date || null,
          age: submission.age || null,
          sex: submission.sex || null,
          uhid: submission.uhid || null,
          chiefComplaint: submission.chiefComplaint || null,
          historyPresenting: submission.historyPresenting || null,
          pastHistory: submission.pastHistory || null,
          personalHistory: submission.personalHistory || null,
          familyHistory: submission.familyHistory || null,
          clinicalExamination: submission.clinicalExamination || null,
          labExaminations: submission.labExaminations || null,
          diagnosis: submission.diagnosis || null,
          management: submission.management || null,
          rejectionReason: submission.rejectionReason || null,
          teacherComments: submission.teacherComments || null,
        },
        timestamps: {
          createdAt: submission.createdAt,
          updatedAt: submission.updatedAt,
          submittedAt: submission.submittedAt || null,
          approvedAt: submission.approvedAt || null,
          rejectedAt: submission.rejectedAt || null,
        },
        approvedBy: submission.approvedBy || null,
        course: submission.course,
      };

      return res.json({
        success: true,
        data: transformedSubmission,
      });
    } catch (error) {
      return this.handleError(error as Error, res);
    }
  };

  static getAllCasesForUser = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { userId } = req.params; // Get userId from URL params

      // Validate teacher authentication
      if (!req.user?.userId) {
        throw new UnauthorizedError("User not authenticated");
      }

      // Validate userId parameter
      if (!userId || userId.trim() === "") {
        throw new ValidationError("User ID is required");
      }

      // Validate userId format (assuming it's a UUID or similar)
      const userIdRegex = /^[a-zA-Z0-9-_]+$/;
      if (!userIdRegex.test(userId.trim())) {
        throw new ValidationError("Invalid user ID format");
      }

      const teacherId = req.user.userId;

      console.log("teacherId", teacherId);
      
      
      // Verify user exists and teacher has access to this user's submissions
      const userExists = await prisma.user.findFirst({
        where: {
          id: userId.trim(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdLogs: {
            where: {
              course: {
                teacherId: teacherId,
              },
            },
            take: 1, // Just check if any submissions exist
          },
        },
      });

      if (!userExists) {
        throw new NotFoundError("User not found");
      }

      // Get all submissions for the specific user where the teacher has access
      const submissions = await prisma.log.findMany({
        where: {
          createdById: userId.trim(), // Filter by the user who created the submission
          course: {
            teacherId: teacherId, // Ensure teacher has access to the course
          },
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              name: true,
              facultyName: true,
              hospitalName: true,
              location: true,
              contactProgram: true,
              endDate: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc", // Order by most recent first
        },
      });
      // Handle case where user exists but has no submissions in teacher's courses
      if (!submissions || submissions.length === 0) {
        return res.json({
          success: true,
          data: {
            userId: userId,
            userName: userExists.name || "Unknown",
            userEmail: userExists.email || null,
            totalCases: 0,
            cases: [],
            message: "No submissions found for this user in your courses",
          },
        });
      }

      // Transform the submissions with proper error handling
      const transformedSubmissions = submissions.map((submission) => {
        try {
          return {
            id: submission.id,
            learnerName: submission.createdBy?.name || "Unknown",
            learnerId: submission.createdBy?.id || null,
            learnerEmail: submission.createdBy?.email || null,
            taskTitle: submission.course?.title || "Unknown Course",
            courseName: submission.course?.name || "Unknown",
            department: submission.course?.facultyName || "Unknown",
            hospitalName: submission.course?.hospitalName || "Unknown",
            status: submission.status?.toLowerCase() || "unknown",
            priority: getPriority(submission),
            
              caseNo: submission.caseNo || null,
              date: submission.date || null,
              age: submission.age || null,
              sex: submission.sex || null,
              uhid: submission.uhid || null,
              chiefComplaint: submission.chiefComplaint || null,
              historyPresenting: submission.historyPresenting || null,
              pastHistory: submission.pastHistory || null,
              personalHistory: submission.personalHistory || null,
              familyHistory: submission.familyHistory || null,
              clinicalExamination: submission.clinicalExamination || null,
              labExaminations: submission.labExaminations || null,
              diagnosis: submission.diagnosis || null,
              management: submission.management || null,
              rejectionReason: submission.rejectionReason || null,
              teacherComments: submission.teacherComments || null,
           
            timestamps: {
              createdAt: submission.createdAt,
              updatedAt: submission.updatedAt,
              submittedAt: submission.submittedAt || null,
              approvedAt: submission.approvedAt || null,
              rejectedAt: submission.rejectedAt || null,
            },
            approvedBy: submission.approvedBy || null,
            course: submission.course,
          };
        } catch (transformError) {
          // Log transformation error but don't fail the entire request
          console.error(
            `Error transforming submission ${submission.id}:`,
            transformError
          );
          return {
            id: submission.id,
            error: "Failed to transform submission data",
            rawData: {
              id: submission.id,
              status: submission.status,
              createdAt: submission.createdAt,
            },
          };
        }
      });

      return res.json({
        success: true,
        data: {
          userId: userId,
          userName: userExists.name || "Unknown",
          userEmail: userExists.email || null,
          totalCases: transformedSubmissions.length,
          cases: transformedSubmissions,
        },
      });
    } catch (error) {
      // Enhanced error handling with specific error types
      console.error("Error in getAllCasesForUser:", error);

      // Handle specific database errors
      if (error.code === "P2002") {
        return res.status(409).json({
          success: false,
          error: {
            type: "CONFLICT",
            message: "Database constraint violation",
            details: error.message,
          },
        });
      }

      if (error.code === "P2025") {
        return res.status(404).json({
          success: false,
          error: {
            type: "NOT_FOUND",
            message: "Record not found",
            details: error.message,
          },
        });
      }

      // Handle connection errors
      if (error.code === "P1001" || error.code === "P1002") {
        return res.status(503).json({
          success: false,
          error: {
            type: "SERVICE_UNAVAILABLE",
            message: "Database connection error",
            details: "Please try again later",
          },
        });
      }

      return this.handleError(error as Error, res);
    }
  };

  // Alternative: Get cases with additional filtering options and enhanced error handling
  static getAllCasesForUserWithFilters = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { userId } = req.params;
      const { status, courseId, limit, offset } = req.query;

      // Validate teacher authentication
      if (!req.user?.userId) {
        throw new UnauthorizedError("User not authenticated");
      }

      // Validate userId parameter
      if (!userId || userId.trim() === "") {
        throw new ValidationError("User ID is required");
      }

      // Validate userId format
      const userIdRegex = /^[a-zA-Z0-9-_]+$/;
      if (!userIdRegex.test(userId.trim())) {
        throw new ValidationError("Invalid user ID format");
      }

      // Validate query parameters
      if (
        limit &&
        (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)
      ) {
        throw new ValidationError("Limit must be a number between 1 and 100");
      }

      if (offset && (isNaN(Number(offset)) || Number(offset) < 0)) {
        throw new ValidationError("Offset must be a non-negative number");
      }

      if (
        status &&
        !["pending", "approved", "rejected", "draft"].includes(status as string)
      ) {
        throw new ValidationError(
          "Invalid status. Must be one of: pending, approved, rejected, draft"
        );
      }

      const teacherId = req.user.userId;

      // Verify user exists and teacher has access
      const userExists = await prisma.user.findFirst({
        where: {
          id: userId.trim(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          logs: {
            where: {
              course: {
                teacherId: teacherId,
              },
            },
            take: 1,
          },
        },
      });

      if (!userExists) {
        throw new NotFoundError("User not found");
      }

      if (userExists.logs.length === 0) {
        throw new ForbiddenError(
          "You do not have permission to view this user's submissions"
        );
      }

      // Validate courseId if provided
      if (courseId) {
        const courseExists = await prisma.course.findFirst({
          where: {
            id: courseId as string,
            teacherId: teacherId,
          },
        });

        if (!courseExists) {
          throw new NotFoundError(
            "Course not found or you do not have access to it"
          );
        }
      }

      // Build where clause with validation
      const whereClause: any = {
        createdById: userId.trim(),
        course: {
          teacherId: teacherId,
        },
      };

      // Add optional filters
      if (status) {
        whereClause.status = status;
      }

      if (courseId) {
        whereClause.courseId = courseId;
      }

      // Build query options with safe defaults
      const queryOptions: any = {
        where: whereClause,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              name: true,
              facultyName: true,
              hospitalName: true,
              location: true,
              contactProgram: true,
              endDate: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      };

      // Add pagination with safe limits
      const safeLimit = Math.min(Number(limit) || 20, 100);
      const safeOffset = Math.max(Number(offset) || 0, 0);

      queryOptions.take = safeLimit;
      queryOptions.skip = safeOffset;

      // Execute queries with error handling
      let submissions, totalCount;

      try {
        [submissions, totalCount] = await Promise.all([
          prisma.log.findMany(queryOptions),
          prisma.log.count({ where: whereClause }),
        ]);
      } catch (dbError) {
        console.error("Database query error:", dbError);
        throw new Error("Failed to fetch submissions from database");
      }

      // Handle empty results
      if (!submissions || submissions.length === 0) {
        return res.json({
          success: true,
          data: {
            userId: userId,
            userName: userExists.name || "Unknown",
            userEmail: userExists.email || null,
            totalCases: totalCount || 0,
            returnedCases: 0,
            cases: [],
            message:
              totalCount === 0
                ? "No submissions found for this user in your courses"
                : "No submissions match the provided filters",
            pagination: {
              limit: safeLimit,
              offset: safeOffset,
              hasMore: false,
            },
          },
        });
      }

      // Transform submissions with individual error handling
      const transformedSubmissions = submissions.map((submission) => {
        try {
          return {
            id: submission.id,
            learnerName: submission.createdBy?.name || "Unknown",
            learnerId: submission.createdBy?.id || null,
            learnerEmail: submission.createdBy?.email || null,
            taskTitle: submission.course?.title || "Unknown Course",
            courseName: submission.course?.name || "Unknown",
            department: submission.course?.facultyName || "Unknown",
            hospitalName: submission.course?.hospitalName || "Unknown",
            status: submission.status?.toLowerCase() || "unknown",
            priority: getPriority(submission),
            caseDetails: {
              caseNo: submission.caseNo || null,
              date: submission.date || null,
              age: submission.age || null,
              sex: submission.sex || null,
              uhid: submission.uhid || null,
              chiefComplaint: submission.chiefComplaint || null,
              historyPresenting: submission.historyPresenting || null,
              pastHistory: submission.pastHistory || null,
              personalHistory: submission.personalHistory || null,
              familyHistory: submission.familyHistory || null,
              clinicalExamination: submission.clinicalExamination || null,
              labExaminations: submission.labExaminations || null,
              diagnosis: submission.diagnosis || null,
              management: submission.management || null,
              rejectionReason: submission.rejectionReason || null,
              teacherComments: submission.teacherComments || null,
            },
            timestamps: {
              createdAt: submission.createdAt,
              updatedAt: submission.updatedAt,
              submittedAt: submission.submittedAt || null,
              approvedAt: submission.approvedAt || null,
              rejectedAt: submission.rejectedAt || null,
            },
            approvedBy: submission.approvedBy || null,
            course: submission.course,
          };
        } catch (transformError) {
          console.error(
            `Error transforming submission ${submission.id}:`,
            transformError
          );
          return {
            id: submission.id,
            error: "Failed to transform submission data",
            rawData: {
              id: submission.id,
              status: submission.status,
              createdAt: submission.createdAt,
            },
          };
        }
      });

      return res.json({
        success: true,
        data: {
          userId: userId,
          userName: userExists.name || "Unknown",
          userEmail: userExists.email || null,
          totalCases: totalCount,
          returnedCases: transformedSubmissions.length,
          cases: transformedSubmissions,
          pagination: {
            limit: safeLimit,
            offset: safeOffset,
            hasMore: totalCount > safeOffset + transformedSubmissions.length,
          },
          filters: {
            status: status || null,
            courseId: courseId || null,
          },
        },
      });
    } catch (error) {
      console.error("Error in getAllCasesForUserWithFilters:", error);

      // Handle specific database errors
      if (error.code === "P2002") {
        return res.status(409).json({
          success: false,
          error: {
            type: "CONFLICT",
            message: "Database constraint violation",
            details: error.message,
          },
        });
      }

      if (error.code === "P2025") {
        return res.status(404).json({
          success: false,
          error: {
            type: "NOT_FOUND",
            message: "Record not found",
            details: error.message,
          },
        });
      }

      // Handle connection errors
      if (error.code === "P1001" || error.code === "P1002") {
        return res.status(503).json({
          success: false,
          error: {
            type: "SERVICE_UNAVAILABLE",
            message: "Database connection error",
            details: "Please try again later",
          },
        });
      }

      // Handle timeout errors
      if (error.code === "P1008") {
        return res.status(408).json({
          success: false,
          error: {
            type: "REQUEST_TIMEOUT",
            message: "Database query timeout",
            details: "The request took too long to process",
          },
        });
      }

      return this.handleError(error as Error, res);
    }
  };

  // Approve a case/submission
  static approveCase = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;
      const { teacherComments } = req.body;

      // Validate user authentication
      if (!req.user?.userId) {
        throw new UnauthorizedError("User not authenticated");
      }

      // Validate ID parameter
      if (!id || id.trim() === "") {
        throw new ValidationError("Submission ID is required");
      }

      const teacherId = req.user.userId;

      // Verify the submission belongs to this teacher and can be approved
      const submission = await prisma.log.findFirst({
        where: {
          id: id.trim(),
          course: {
            teacherId: teacherId,
          },
          status: "SUBMITTED",
        },
      });

      if (!submission) {
        throw new NotFoundError(
          "Submission not found, already processed, or you do not have permission to approve it"
        );
      }

      // Update the submission with transaction for data consistency
      const updatedSubmission = await prisma.$transaction(async (tx) => {
        return await tx.log.update({
          where: { id: id.trim() },
          data: {
            status: "APPROVED",
            approvedById: teacherId,
            approvedAt: new Date(),
            teacherComments: teacherComments?.trim() || null,
            updatedAt: new Date(),
          },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            course: {
              select: {
                title: true,
                name: true,
              },
            },
          },
        });
      });

      // TODO: Send notification to student
      // await sendNotification(updatedSubmission.createdBy.email, 'CASE_APPROVED', {...});

      return res.json({
        success: true,
        message: "Case approved successfully",
        data: {
          id: updatedSubmission.id,
          status: updatedSubmission.status.toLowerCase(),
          approvedAt: updatedSubmission.approvedAt,
          teacherComments: updatedSubmission.teacherComments,
        },
      });
    } catch (error) {
      return this.handleError(error as Error, res);
    }
  };

  // Reject a case/submission
  static rejectCase = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;
      const { rejectionReason, teacherComments } = req.body;

      // Validate user authentication
      if (!req.user?.userId) {
        throw new UnauthorizedError("User not authenticated");
      }

      // Validate ID parameter
      if (!id || id.trim() === "") {
        throw new ValidationError("Submission ID is required");
      }

      // Validate rejection reason
      if (!rejectionReason || !rejectionReason.trim()) {
        throw new ValidationError(
          "Rejection reason is required and cannot be empty"
        );
      }

      if (rejectionReason.trim().length > 1000) {
        throw new ValidationError(
          "Rejection reason cannot exceed 1000 characters"
        );
      }

      const teacherId = req.user.userId;

      // Verify the submission belongs to this teacher and can be rejected
      const submission = await prisma.log.findFirst({
        where: {
          id: id.trim(),
          course: {
            teacherId: teacherId,
          },
          status: "SUBMITTED",
        },
      });

      if (!submission) {
        throw new NotFoundError(
          "Submission not found, already processed, or you do not have permission to reject it"
        );
      }

      // Update the submission with transaction for data consistency
      const updatedSubmission = await prisma.$transaction(async (tx) => {
        return await tx.log.update({
          where: { id: id.trim() },
          data: {
            status: "REJECTED",
            rejectionReason: rejectionReason.trim(),
            teacherComments: teacherComments?.trim() || null,
            rejectedAt: new Date(),
            updatedAt: new Date(),
          },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            course: {
              select: {
                title: true,
                name: true,
              },
            },
          },
        });
      });

      // TODO: Send notification to student
      // await sendNotification(updatedSubmission.createdBy.email, 'CASE_REJECTED', {...});

      return res.json({
        success: true,
        message: "Case rejected successfully",
        data: {
          id: updatedSubmission.id,
          status: updatedSubmission.status.toLowerCase(),
          rejectedAt: updatedSubmission.rejectedAt,
          rejectionReason: updatedSubmission.rejectionReason,
          teacherComments: updatedSubmission.teacherComments,
        },
      });
    } catch (error) {
      return this.handleError(error as Error, res);
    }
  };

  // Get dashboard statistics
  static getDashboardStats = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      // Validate user authentication
      if (!req.user?.userId) {
        throw new UnauthorizedError("User not authenticated");
      }

      const teacherId = req.user.userId;
      const { period = "30" } = req.query;

      // Validate period parameter
      const periodDays = parseInt(period as string);
      if (isNaN(periodDays) || periodDays < 1 || periodDays > 365) {
        throw new ValidationError("Period must be between 1 and 365 days");
      }

      const periodDate = new Date();
      periodDate.setDate(periodDate.getDate() - periodDays);

      // Get all submissions for this teacher
      const submissions = await prisma.log.findMany({
        where: {
          course: {
            teacherId: teacherId,
          },
          createdAt: {
            gte: periodDate,
          },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          submittedAt: true,
          approvedAt: true,
          rejectedAt: true,
          course: {
            select: {
              facultyName: true,
            },
          },
        },
      });

      // Calculate statistics
      const total = submissions.length;
      const approved = submissions.filter(
        (s) => s.status === "APPROVED"
      ).length;
      const rejected = submissions.filter(
        (s) => s.status === "REJECTED"
      ).length;
      const pending = submissions.filter(
        (s) => s.status === "SUBMITTED"
      ).length;
      const draft = submissions.filter((s) => s.status === "DRAFT").length;

      // Department wise stats
      const departmentStats = submissions.reduce((acc, submission) => {
        const dept = submission.course?.facultyName || "Unknown";
        if (!acc[dept]) {
          acc[dept] = { total: 0, approved: 0, rejected: 0, pending: 0 };
        }
        acc[dept].total++;
        if (submission.status === "APPROVED") acc[dept].approved++;
        if (submission.status === "REJECTED") acc[dept].rejected++;
        if (submission.status === "SUBMITTED") acc[dept].pending++;
        return acc;
      }, {} as Record<string, any>);

      // Approval rate
      const totalProcessed = approved + rejected;
      const approvalRate =
        totalProcessed > 0
          ? ((approved / totalProcessed) * 100).toFixed(1)
          : "0";

      // Recent activity (last 7 days)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 7);

      const recentActivity = await prisma.log.findMany({
        where: {
          course: {
            teacherId: teacherId,
          },
          updatedAt: {
            gte: recentDate,
          },
        },
        include: {
          createdBy: {
            select: {
              name: true,
            },
          },
          course: {
            select: {
              title: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 10,
      });

      return res.json({
        success: true,
        data: {
          period: periodDays,
          summary: {
            total,
            approved,
            rejected,
            pending,
            draft,
            approvalRate: parseFloat(approvalRate),
          },
          departmentStats,
          recentActivity: recentActivity.map((activity) => ({
            id: activity.id,
            caseNo: activity.caseNo || "N/A",
            studentName: activity.createdBy?.name || "Unknown",
            courseTitle: activity.course?.title || "Unknown Course",
            status: activity.status?.toLowerCase() || "unknown",
            updatedAt: activity.updatedAt,
          })),
          chartData: {
            pieData: [
              { name: "Approved", value: approved, color: "#10b981" },
              { name: "Pending", value: pending, color: "#3b82f6" },
              { name: "Rejected", value: rejected, color: "#ef4444" },
              { name: "Draft", value: draft, color: "#6b7280" },
            ],
          },
        },
      });
    } catch (error) {
      return this.handleError(error as Error, res);
    }
  };

  // Bulk approve cases
  static bulkApprove = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { caseIds, teacherComments } = req.body;

      // Validate user authentication
      if (!req.user?.userId) {
        throw new UnauthorizedError("User not authenticated");
      }

      // Validate caseIds parameter
      if (!Array.isArray(caseIds) || caseIds.length === 0) {
        throw new ValidationError(
          "Case IDs array is required and cannot be empty"
        );
      }

      if (caseIds.length > 50) {
        throw new ValidationError("Cannot approve more than 50 cases at once");
      }

      // Validate all IDs are strings and not empty
      const validIds = caseIds.filter(
        (id) => typeof id === "string" && id.trim() !== ""
      );
      if (validIds.length !== caseIds.length) {
        throw new ValidationError(
          "All case IDs must be valid non-empty strings"
        );
      }

      const teacherId = req.user.userId;

      // Verify all cases belong to this teacher and are submitted
      const validCases = await prisma.log.findMany({
        where: {
          id: { in: validIds },
          course: {
            teacherId: teacherId,
          },
          status: "SUBMITTED",
        },
      });

      if (validCases.length === 0) {
        throw new NotFoundError("No valid cases found for approval");
      }

      if (validCases.length !== validIds.length) {
        const validCaseIds = validCases.map((c) => c.id);
        const invalidIds = validIds.filter((id) => !validCaseIds.includes(id));
        throw new ValidationError(
          `Some cases are not valid for approval. Invalid IDs: ${invalidIds.join(
            ", "
          )}`
        );
      }

      // Bulk update with transaction
      const result = await prisma.$transaction(async (tx) => {
        return await tx.log.updateMany({
          where: {
            id: { in: validIds },
          },
          data: {
            status: "APPROVED",
            approvedById: teacherId,
            approvedAt: new Date(),
            teacherComments: teacherComments?.trim() || null,
            updatedAt: new Date(),
          },
        });
      });

      return res.json({
        success: true,
        message: `${result.count} cases approved successfully`,
        data: {
          approvedCount: result.count,
          requestedCount: validIds.length,
        },
      });
    } catch (error) {
      return this.handleError(error as Error, res);
    }
  };

  // Export submissions data
  static exportData = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      // Validate user authentication
      if (!req.user?.userId) {
        throw new UnauthorizedError("User not authenticated");
      }

      const teacherId = req.user.userId;
      const { format = "csv", status, startDate, endDate } = req.query;

      // Validate format
      if (format !== "csv" && format !== "json") {
        throw new ValidationError('Format must be either "csv" or "json"');
      }

      // Validate date range
      this.validateDateRange(startDate as string, endDate as string);

      const where: any = {
        course: {
          teacherId: teacherId,
        },
      };

      if (status && status !== "all") {
        const validStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"];
        if (!validStatuses.includes((status as string).toUpperCase())) {
          throw new ValidationError(
            `Invalid status. Must be one of: ${validStatuses.join(", ")}`
          );
        }
        where.status = (status as string).toUpperCase();
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const submissions = await prisma.log.findMany({
        where,
        include: {
          createdBy: {
            select: {
              name: true,
              email: true,
            },
          },
          course: {
            select: {
              title: true,
              name: true,
              facultyName: true,
              hospitalName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (submissions.length === 0) {
        throw new NotFoundError("No submissions found matching the criteria");
      }

      if (format === "csv") {
        const csvData = submissions.map((sub) => ({
          "Case No": sub.caseNo || "",
          "Student Name": sub.createdBy?.name || "",
          "Student Email": sub.createdBy?.email || "",
          Course: sub.course?.title || "",
          Department: sub.course?.facultyName || "",
          Hospital: sub.course?.hospitalName || "",
          Status: sub.status || "",
          Age: sub.age || "",
          Sex: sub.sex || "",
          UHID: sub.uhid || "",
          "Chief Complaint": sub.chiefComplaint || "",
          Diagnosis: sub.diagnosis || "",
          "Submitted At": sub.submittedAt ? sub.submittedAt.toISOString() : "",
          "Approved At": sub.approvedAt ? sub.approvedAt.toISOString() : "",
          "Rejected At": sub.rejectedAt ? sub.rejectedAt.toISOString() : "",
          "Rejection Reason": sub.rejectionReason || "",
        }));

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=submissions-${
            new Date().toISOString().split("T")[0]
          }.csv`
        );

        const csv = convertToCSV(csvData);
        return res.send(csv);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=submissions-${
            new Date().toISOString().split("T")[0]
          }.json`
        );

        return res.json({
          success: true,
          exportDate: new Date().toISOString(),
          totalRecords: submissions.length,
          data: submissions,
        });
      }
    } catch (error) {
      return this.handleError(error as Error, res);
    }
  };
}

// Helper function to determine priority based on submission date and due date
function getPriority(log: any): string {
  try {
    if (!log.course?.endDate) return "low";

    const now = new Date();
    const dueDate = new Date(log.course.endDate);

    if (isNaN(dueDate.getTime())) return "low";

    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilDue < 0) return "overdue";
    if (daysUntilDue < 1) return "high";
    if (daysUntilDue < 7) return "medium";
    return "low";
  } catch (error) {
    console.error("Error calculating priority:", error);
    return "low";
  }
}

// Helper function to validate date strings
function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

// Helper function to convert data to CSV with proper escaping
function convertToCSV(data: any[]): string {
  try {
    if (!data.length) return "";

    const headers = Object.keys(data[0]);
    const escapeValue = (value: any): string => {
      if (value === null || value === undefined) return "";

      const stringValue = String(value);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (
        stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
      ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const csvContent = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((header) => escapeValue(row[header])).join(",")
      ),
    ].join("\n");

    return csvContent;
  } catch (error) {
    console.error("Error converting to CSV:", error);
    throw new Error("Failed to convert data to CSV format");
  }
}
