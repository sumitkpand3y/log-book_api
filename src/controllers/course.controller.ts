// controllers/courseController.ts

import { Request, Response } from "express";
import prisma from "../models/prisma";
import { validationResult } from "express-validator";
import axios from "axios";

type Course = Awaited<ReturnType<typeof prisma.course.findFirst>>;

export type User = Awaited<ReturnType<typeof prisma.user.findFirst>>;
export type CourseEnrollment = Awaited<
  ReturnType<typeof prisma.courseEnrollment.findFirst>
>;

// interface CourseWithRelations extends Course {
//   teacher: Pick<User, "id" | "name" | "email">;
//   _count: {
//     enrollments: number;
//     logs: number;
//   };
//   enrollments?: CourseEnrollment[];
//   isEnrolled?: boolean;
// }

interface CourseCreateData {
  title: string;
  description?: string;
  enrollmentNumber: string;
  facultyName: string;
  teacherId?: string; // Only for admin
}

interface CourseUpdateData extends Partial<CourseCreateData> {}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  errors?: Record<string, string>;
}

interface PaginatedResponse<T> {
  courses: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface EnrollmentRequest {
  courseId: string;
  learnerId?: string; // Only for admin
}

interface MoodleCourse {
  courseid?: number;
  classroomid?: number;
  fullname: string;
  classroomname?: string;
  classroomshortname?: string;
  training_location: string;
  training_location_status: string;
  primary_trainer: string;
  secondary_trainer: string;
  training_location_start_date: string;
  training_location_end_date: string;
  shortname: string;
  startdate: string;
  enddate: string;
  visible: number;
  batch_wise: boolean;
}

interface MoodleEnrollmentResponse {
  status: boolean;
  message: string;
  courses?: MoodleCourse[];
}

export class CourseController {
  // Get all courses with role-based filtering
  static getAllCourses = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const {
        page = "1",
        limit = "10",
        search,
        teacherId,
      }: {
        page?: string;
        limit?: string;
        search?: string;
        teacherId?: string;
      } = req.query;

      const where: any = {};

      // Search functionality
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { enrollmentNumber: { contains: search, mode: "insensitive" } },
          { facultyName: { contains: search, mode: "insensitive" } },
        ];
      }

      // Role-based filtering
      switch (req.user.role) {
        case "LEARNER":
          // Learners see all available courses (they can choose to enroll)
          break;

        case "TEACHER":
          // Teachers see their own courses
          where.teacherId = req.user.userId;
          break;

        case "ADMIN":
          // Admins can filter by teacher
          if (teacherId) where.teacherId = teacherId;
          break;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where,
          include: {
            teacher: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            _count: {
              select: {
                enrollments: true,
                logs: true,
              },
            },
            enrollments:
              req.user.role === UserRole.LEARNER
                ? {
                    where: { learnerId: req.user.userId },
                    select: { id: true, enrolledAt: true },
                  }
                : false,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: parseInt(limit),
        }),
        prisma.course.count({ where }),
      ]);

      // Add enrollment status for learners
      const coursesWithEnrollment = courses.map((course) => ({
        ...course,
        isEnrolled:
          req.user.role === "LEARNER"
            ? course.enrollments && course.enrollments.length > 0
            : undefined,
        enrollments: undefined, // Don't expose enrollment details
      }));

      return res.json({
        success: true,
        data: {
          courses: coursesWithEnrollment,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching courses:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch courses",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Get enrolled courses for a user
  static getEnrolledCourses = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      // Parse and validate query params
      const {
        page = "1",
        limit = "10",
        userId,
      }: {
        page?: string;
        limit?: string;
        userId?: string;
      } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(pageNum) || isNaN(limitNum) || pageNum <= 0 || limitNum <= 0) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid pagination parameters. Page and limit must be positive integers.",
        });
      }

      // Check if req.user exists
      if (!req.user || !req.user.userId || !req.user.role) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized. Missing user data in request.",
        });
      }

      // Set the target user ID based on role and permissions
      let targetUserId = req.user.userId;

      if (req.user.role === "ADMIN" && userId) {
        targetUserId = userId;
      } else if (req.user.role === "TEACHER") {
        if (userId && userId !== req.user.userId) {
          return res.status(403).json({
            success: false,
            error:
              "Access denied. Teachers cannot view other users' enrollments.",
          });
        }
      }

      // // First try to get courses from local database
      // try {
      //   const localCourses = await this.getLocalEnrolledCourses(
      //     req,
      //     res,
      //     targetUserId,
      //     pageNum,
      //     limitNum
      //   );

      //   // If we have local courses, return them immediately
      //   if (localCourses) {
      //     return localCourses;
      //   }
      // } catch (localError) {
      //   console.error("Local database error:", localError);
      //   // Continue to Moodle sync if local fails
      // }

      // If no local courses or error, try Moodle sync
      try {
        const user = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { email: true, name: true },
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User not found.",
          });
        }

        // Fetch enrolled courses from Moodle API for syncing
        const moodleApiUrl =
          "https://uatexpedite.asterhealthacademy.com/webservice/rest/server.php";
        const wsToken = "ee3f9db9c91ca1c79eca7b7d644c93c7";

        const moodleResponse = await axios.get(moodleApiUrl, {
          params: {
            wsfunction: "local_users_enrolled_courses",
            wstoken: wsToken,
            moodlewsrestformat: "json",
            email: user.email,
          },
          timeout: 15000,
        });

        const moodleData: MoodleEnrollmentResponse = moodleResponse.data;
        if (moodleData.status && moodleData.courses) {
          // Transform Moodle courses
          const transformedCourses = moodleData.courses.map(
            (course: MoodleCourse, index: number) => ({
              id: course.courseid
                ? course.courseid.toString()
                : `course-${index}`,
              ...course
            })
          );

          // Sync with local database
          await this.syncCoursesWithLocalDB(transformedCourses, targetUserId);

          try {
            const localCourses = await this.getLocalEnrolledCourses(
              req,
              res,
              targetUserId,
              pageNum,
              limitNum
            );
            if (localCourses) {
              return localCourses;
            }
          } catch (localError) {
            console.error("Local database error:", localError);
            // Continue to Moodle sync if local fails
          }
        }

        // If Moodle also fails, return empty response
        return res.json({
          success: true,
          data: {
            courses: [],
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: 0,
              pages: 0,
            },
            message: "No courses found in local database or Moodle.",
            source: "none",
          },
        });
      } catch (moodleError) {
        console.error("Moodle API error:", moodleError);
        return res.status(500).json({
          success: false,
          error: "Failed to fetch courses from both local database and Moodle",
        });
      }
    } catch (error: any) {
      console.error("🔥 Error in getEnrolledCourses:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unexpected error",
      });
    }
  };

  // Modified getLocalEnrolledCourses to return null when no courses found
  private static async getLocalEnrolledCourses(
    req: Request,
    res: Response,
    targetUserId: string,
    pageNum: number,
    limitNum: number
  ): Promise<Response | null> {
    try {
      const skip = (pageNum - 1) * limitNum;

      const [enrollments, total] = await Promise.all([
        prisma.courseEnrollment.findMany({
          where: { learnerId: targetUserId },
          include: {
            course: {
              include: {
                teacher: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
                _count: {
                  select: {
                    enrollments: true,
                    logs: true,
                  },
                },
              },
            },
          },
          orderBy: { enrolledAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.courseEnrollment.count({
          where: { learnerId: targetUserId },
        }),
      ]);

      if (!enrollments || enrollments.length === 0) {
        return null; // Return null to indicate no local courses
      }

      const courses = enrollments.map((enrollment) => ({
        ...enrollment.course,
        isEnrolled: true,
        enrolledAt: enrollment.enrolledAt,
        source: "local",
      }));

      return res.json({
        success: true,
        data: {
          courses,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
          source: "local",
        },
      });
    } catch (error) {
      console.error("Error in local database query:", error);
      throw error;
    }
  }

  private static async syncCoursesWithLocalDB(
    moodleCourses: any[],
    userId: string
  ): Promise<void> {
    try {
      for (const course of moodleCourses) {
        // Process trainers data
        let teacherIds: string[] = [];

        if (course.expedite_course_trainers) {
          try {
            const trainers = JSON.parse(course.expedite_course_trainers);

            for (const trainer of trainers) {
              // Check if teacher exists by email
              let teacher = await prisma.user.findUnique({
                where: { email: trainer.email },
              });

              // If teacher doesn't exist, create them
              if (!teacher) {
                teacher = await prisma.user.create({
                  data: {
                    name: `${trainer.firstname} ${trainer.lastname}`,
                    email: trainer.email,
                    role: "TEACHER",
                    password: trainer.password, // Consider generating a random password or requiring reset
                  },
                });
              } else if (teacher.role !== "TEACHER") {
                // Update role if existing user isn't a teacher
                teacher = await prisma.user.update({
                  where: { id: teacher.id },
                  data: { role: "TEACHER" },
                });
              }

              teacherIds.push(teacher.id);
            }
          } catch (e) {
            console.error("Error parsing trainers data:", e);
          }
        }

        // Check if course exists in local database
        const existingCourse = await prisma.course.findFirst({
          where: {
            OR: [{ moodleId: course.id }, { title: course.title }],
          },
          // include: {
          //   teachers: true // Include existing teacher relationships
          // }
        });

        if (!existingCourse) {
          // Create new course
          const newCourse = await prisma.course.create({
            data: {
              title: course.fullname,
              name: course.fullname,
              location: course.training_location || "Unknown",
              enrollmentNumber: course.shortname,
              description: `Training Location: ${course.training_location}`,
              moodleId: course.id,
              shortname: course.shortname,
               startDate: new Date(course.startdate).toISOString(), // Assuming Unix timestamp
              endDate: new Date(course.enddate).toISOString(), // Assuming Unix timestamp
              visible: course.visible,
              facultyName:
                course.published_trainer == "primary"
                  ? course.primary_trainer
                  : course.secondary_trainer,
              classroomName: course.classroomname,
              trainingLocation: course.training_location,
              trainingLocationStatus: course.training_location_status,
              primaryTrainer: course.primary_trainer,
              secondaryTrainer: course.secondary_trainer,
              trainingLocationStartDate: new Date(course.training_location_start_date).toISOString(),
              trainingLocationEndDate: new Date(course.training_location_end_date).toISOString(),
              batchWise: course.batch_wise,
              status: course.status,
              classroomShortname: course.classroomshortname,
              teacherId: teacherIds[0] || userId, // Set primary teacher or fallback to current user
            },
          });

          // Create teacher associations through CourseTeacher model
          if (teacherIds.length > 0) {
            await Promise.all(
              teacherIds.map((teacherId) =>
                prisma.courseTeacher.create({
                  data: {
                    courseId: newCourse.id,
                    teacherId: teacherId,
                  },
                })
              )
            );
          }

          // Sync enrollment data
          await prisma.courseEnrollment.create({
            data: {
              learnerId: userId,
              courseId: newCourse.id,
              enrolledAt: new Date(),
            },
          });
        } else {
          // Update existing course
          await prisma.course.update({
            where: { id: existingCourse.id },
            data: {
              title: course.fullname,
              name: course.fullname,
              location: course.training_location || "Unknown",
              enrollmentNumber: course.shortname,
              description: `Training Location: ${course.training_location}`,
              moodleId: course.id,
              shortname: course.shortname,
              startDate: new Date(course.startdate).toISOString(), // Assuming Unix timestamp
              endDate: new Date(course.enddate).toISOString(), // Assuming Unix timestamp
              visible: course.visible,
              facultyName:
                course.published_trainer == "primary"
                  ? course.primary_trainer
                  : course.secondary_trainer,
              classroomName: course.classroomname,
              trainingLocation: course.training_location,
              trainingLocationStatus: course.training_location_status,
              primaryTrainer: course.primary_trainer,
              secondaryTrainer: course.secondary_trainer,
              trainingLocationStartDate: new Date(course.training_location_start_date).toISOString(),
              trainingLocationEndDate: new Date(course.training_location_end_date).toISOString(),
              batchWise: course.batch_wise,
              status: course.status,
              classroomShortname: course.classroomshortname,
              teacherId: teacherIds[0] || existingCourse.teacherId,
            },
          });

          // Update teacher associations
          if (teacherIds.length > 0) {
            // First remove any existing teacher associations not in the new list
            const existingTeacherIds = existingCourse.teachers.map(
              (t) => t.teacherId
            );
            const teachersToRemove = existingTeacherIds.filter(
              (id) => !teacherIds.includes(id)
            );

            await Promise.all(
              teachersToRemove.map((teacherId) =>
                prisma.courseTeacher.deleteMany({
                  where: {
                    courseId: existingCourse.id,
                    teacherId: teacherId,
                  },
                })
              )
            );

            // Then add any new teachers not already associated
            const teachersToAdd = teacherIds.filter(
              (id) => !existingTeacherIds.includes(id)
            );

            await Promise.all(
              teachersToAdd.map((teacherId) =>
                prisma.courseTeacher.create({
                  data: {
                    courseId: existingCourse.id,
                    teacherId: teacherId,
                  },
                })
              )
            );
          }

          // Check if enrollment exists
          const existingEnrollment = await prisma.courseEnrollment.findFirst({
            where: {
              learnerId: userId,
              courseId: existingCourse.id,
            },
          });

          if (!existingEnrollment) {
            await prisma.courseEnrollment.create({
              data: {
                learnerId: userId,
                courseId: existingCourse.id,
                enrolledAt: new Date(),
              },
            });
          }
        }
      }
    } catch (error) {
      console.error("Error syncing courses with local DB:", error);
      // Don't throw error here to avoid breaking the main flow
    }
  }
  // Get single course by ID
  static getCourseById = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id }: { id: string } = req.params;

      const course = await prisma.course.findUnique({
        where: { id },
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
              logs: true,
            },
          },
          enrollments:
            req.user.role === "LEARNER"
              ? {
                  where: { learnerId: req.user.userId },
                  select: { id: true, enrolledAt: true },
                }
              : req.user.role === "ADMIN" || req.user.role === "TEACHER"
              ? {
                  include: {
                    learner: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                }
              : false,
        },
      });

      if (!course) {
        return res.status(404).json({
          success: false,
          error: "Course not found",
        });
      }

      // Check access permissions
      if (req.user.role === "TEACHER" && course.teacherId !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const courseWithEnrollment = {
        ...course,
        isEnrolled:
          req.user.role === "LEARNER"
            ? course.enrollments && course.enrollments.length > 0
            : undefined,
      };

      return res.json({
        success: true,
        data: courseWithEnrollment,
      });
    } catch (error) {
      console.error("Error fetching course:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch course",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Create new course (Teachers and Admins)
  static createCourse = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      // Only teachers and admins can create courses
      if (!["TEACHER", "ADMIN"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: "Only teachers and admins can create courses",
        });
      }

      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorObj: Record<string, string> = {};
        errors.array().forEach((error) => {
          if (error.type === "field") {
            errorObj[error.path] = error.msg;
          }
        });
        return res.status(400).json({
          success: false,
          errors: errorObj,
        });
      }

      const { title, description, enrollmentNumber, facultyName, teacherId } =
        req.body;

      // Check if enrollment number already exists
      const existingCourse = await prisma.course.findUnique({
        where: { enrollmentNumber },
      });

      if (existingCourse) {
        return res.status(400).json({
          success: false,
          errors: { enrollmentNumber: "Enrollment number already exists" },
        });
      }

      // Determine the actual teacher
      const actualTeacherId =
        req.user.role === "ADMIN" && teacherId ? teacherId : req.user.userId;

      // Verify teacher exists and has correct role
      if (req.user.role === "ADMIN" && teacherId) {
        const teacher = await prisma.user.findUnique({
          where: { id: teacherId },
        });

        if (!teacher || teacher.role !== "TEACHER") {
          return res.status(400).json({
            success: false,
            errors: { teacherId: "Invalid teacher ID" },
          });
        }
      }

      const course = await prisma.course.create({
        data: {
          title,
          description,
          enrollmentNumber,
          facultyName,
          teacherId: actualTeacherId,
        },
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
              logs: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        data: course,
        message: "Course created successfully",
      });
    } catch (error) {
      console.error("Error creating course:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to create course",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Update course
  static updateCourse = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id }: { id: string } = req.params;

      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorObj: Record<string, string> = {};
        errors.array().forEach((error) => {
          if (error.type === "field") {
            errorObj[error.path] = error.msg;
          }
        });
        return res.status(400).json({
          success: false,
          errors: errorObj,
        });
      }

      const existingCourse = await prisma.course.findUnique({
        where: { id },
      });

      if (!existingCourse) {
        return res.status(404).json({
          success: false,
          error: "Course not found",
        });
      }

      // Check permissions
      if (
        req.user.role === "TEACHER" &&
        existingCourse.teacherId !== req.user.userId
      ) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const { title, description, enrollmentNumber, facultyName, teacherId } =
        req.body;

      // Check enrollment number uniqueness if changed
      if (
        enrollmentNumber &&
        enrollmentNumber !== existingCourse.enrollmentNumber
      ) {
        const duplicateCourse = await prisma.course.findUnique({
          where: { enrollmentNumber },
        });

        if (duplicateCourse) {
          return res.status(400).json({
            success: false,
            errors: { enrollmentNumber: "Enrollment number already exists" },
          });
        }
      }

      const updateData: any = {
        title,
        description,
        enrollmentNumber,
        facultyName,
      };

      // Only admin can change teacher
      if (req.user.role === "ADMIN" && teacherId) {
        const teacher = await prisma.user.findUnique({
          where: { id: teacherId },
        });

        if (!teacher || teacher.role !== "TEACHER") {
          return res.status(400).json({
            success: false,
            errors: { teacherId: "Invalid teacher ID" },
          });
        }

        updateData.teacherId = teacherId;
      }

      // Remove undefined values
      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      );

      const updatedCourse = await prisma.course.update({
        where: { id },
        data: updateData,
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
              logs: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: updatedCourse,
        message: "Course updated successfully",
      });
    } catch (error) {
      console.error("Error updating course:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to update course",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Delete course
  static deleteCourse = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id }: { id: string } = req.params;

      const existingCourse = await prisma.course.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              enrollments: true,
              logs: true,
            },
          },
        },
      });

      if (!existingCourse) {
        return res.status(404).json({
          success: false,
          error: "Course not found",
        });
      }

      // Check permissions
      if (
        req.user.role === "TEACHER" &&
        existingCourse.teacherId !== req.user.userId
      ) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      // Check if course has enrollments or logs
      if (
        existingCourse._count.enrollments > 0 ||
        existingCourse._count.logs > 0
      ) {
        return res.status(400).json({
          success: false,
          error: "Cannot delete course with existing enrollments or logs",
        });
      }

      await prisma.course.delete({
        where: { id },
      });

      return res.json({
        success: true,
        message: "Course deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting course:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to delete course",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Enroll in course (Learners)
  static enrollInCourse = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { courseId, learnerId } = req.body;

      // Determine actual learner ID
      const actualLearnerId =
        req.user.role === "ADMIN" && learnerId ? learnerId : req.user.userId;

      // Only learners can enroll themselves, admins can enroll others
      if (req.user.role === "TEACHER") {
        return res.status(403).json({
          success: false,
          error: "Teachers cannot enroll in courses",
        });
      }

      // Check if course exists
      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return res.status(404).json({
          success: false,
          error: "Course not found",
        });
      }

      // Check if already enrolled
      const existingEnrollment = await prisma.courseEnrollment.findFirst({
        where: {
          courseId,
          learnerId: actualLearnerId,
        },
      });

      if (existingEnrollment) {
        return res.status(400).json({
          success: false,
          error: "Already enrolled in this course",
        });
      }

      // Verify learner exists if admin is enrolling someone else
      if (req.user.role === "ADMIN" && learnerId) {
        const learner = await prisma.user.findUnique({
          where: { id: learnerId },
        });

        if (!learner || learner.role !== "LEARNER") {
          return res.status(400).json({
            success: false,
            error: "Invalid learner ID",
          });
        }
      }

      await prisma.courseEnrollment.create({
        data: {
          courseId,
          learnerId: actualLearnerId,
        },
      });

      return res.status(201).json({
        success: true,
        message: "Successfully enrolled in course",
      });
    } catch (error) {
      console.error("Error enrolling in course:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to enroll in course",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Unenroll from course
  static unenrollFromCourse = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { courseId } = req.params;
      const { learnerId } = req.body;

      // Determine actual learner ID
      const actualLearnerId =
        req.user.role === "ADMIN" && learnerId ? learnerId : req.user.userId;

      // Only learners can unenroll themselves, admins can unenroll others
      if (req.user.role === "TEACHER") {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const enrollment = await prisma.courseEnrollment.findFirst({
        where: {
          courseId,
          learnerId: actualLearnerId,
        },
      });

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          error: "Enrollment not found",
        });
      }

      // Check if learner has logs in this course
      const tasksCount = await prisma.task.count({
        where: {
          courseId,
          createdById: actualLearnerId,
        },
      });

      if (tasksCount > 0) {
        return res.status(400).json({
          success: false,
          error: "Cannot unenroll from course with existing logs",
        });
      }

      await prisma.courseEnrollment.delete({
        where: { id: enrollment.id },
      });

      return res.json({
        success: true,
        message: "Successfully unenrolled from course",
      });
    } catch (error) {
      console.error("Error unenrolling from course:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to unenroll from course",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Get course enrollments (Teachers and Admins)
  static getCourseEnrollments = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id: courseId } = req.params;
      const { page = "1", limit = "10" } = req.query;

      // Check course exists and permissions
      const course = await prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return res.status(404).json({
          success: false,
          error: "Course not found",
        });
      }

      // Check permissions
      if (req.user.role === "TEACHER" && course.teacherId !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const [enrollments, total] = await Promise.all([
        prisma.courseEnrollment.findMany({
          where: { courseId },
          include: {
            learner: {
              select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
              },
            },
          },
          orderBy: { enrolledAt: "desc" },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.courseEnrollment.count({
          where: { courseId },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          enrollments,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string)),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching course enrollments:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch course enrollments",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

export default CourseController;
