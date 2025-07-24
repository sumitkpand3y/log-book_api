import { Request, Response, NextFunction } from "express";
import { emailService } from "../services/email.service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Extend Request interface to include submission data
declare global {
  namespace Express {
    interface Request {
      submissionData?: {
        id: string;
        learnerId: string;
        title: string;
        status: "approved" | "rejected";
        teacherName?: string;
        comments?: string;
      };
    }
  }
}

export const sendEmailNotification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // This middleware runs after the submission status is updated
    if (req.submissionData) {
      const { learnerId, id, title, status, teacherName, comments } =
        req.submissionData;

      // Fetch learner details using Prisma
      const learner = await prisma.user.findUnique({
        where: { id: learnerId },
        select: {
          id: true,
          email: true,
          name: true,
          role:true,
        },
      });

      if (learner && learner.email) {
        const learnerName =
          learner.name || "Student";

        const emailData = {
          learnerName,
          learnerEmail: learner.email,
          submissionTitle: title,
          status,
          teacherName,
          comments,
          submissionId: id,
        };

        // Send email (don't await to avoid blocking the response)
        emailService.sendSubmissionStatusEmail(emailData).catch((error) => {
          console.error("Failed to send email notification:", error);
        });
      }
    }

    next();
  } catch (error) {
    console.error("Email middleware error:", error);
    // Don't block the request if email fails
    next();
  }
};

// Pre-submission middleware to fetch submission data
export const prepareSubmissionData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const submissionId = req.params.id;
    // Fetch submission details using Prisma with includes
    const submission = await prisma.log.findUnique({
      where: { id: submissionId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (submission) {
      const teacherName = submission.approvedBy
        ? submission.approvedBy.name ||
          (submission.approvedBy.name
            ? `${submission.approvedBy.name}`
            : submission.approvedBy.name ||
              "Teacher")
        : undefined;

      req.submissionData = {
        id: submission.id,
        learnerId: submission.createdBy.id,
        title: submission.caseNo || "Medical Case Submission",
        status: req.url.includes("/approve") ? "approved" : "rejected",
        teacherName,
        comments: req.body.comments || req.body.feedback || undefined,
      };
    }

    next();
  } catch (error) {
    console.error("Error preparing submission data:", error);
    next(); // Continue even if this fails
  }
};
