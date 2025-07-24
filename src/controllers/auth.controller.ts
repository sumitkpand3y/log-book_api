import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { body, validationResult } from "express-validator";
import prisma from "../models/prisma";
import { generateToken } from "../utils/jwt";
import axios from "axios";

interface MoodleUserData {
  id: string;
  username: string;
  firstname: string;
  lastname: string;
  email: string;
  phone1: string;
  city: string;
  country: string;
  address: string;
  kyc_verified: string;
  student_id: string;
  // Add other fields as needed
}

interface MoodleLoginResponse {
  status: boolean;
  message: string;
  userdata?: string; // JSON string containing user data
}

export class AuthController {
  static validateRegister = [
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("firstName").notEmpty().withMessage("First name is required"),
    body("lastName").notEmpty().withMessage("Last name is required"),
  ];

  static validateLogin = [
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
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
        where: { email },
      });

      if (existingUser) {
        return res
          .status(400)
          .json({ message: "User already exists with this email" });
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
        },
      });

      // Generate token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.status(201).json({
        message: "User registered successfully",
        token,
        user,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };

  static login = async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // First, authenticate with external Moodle API
      const moodleApiUrl =
        "https://uatexpedite.asterhealthacademy.com/webservice/rest/server.php";
      const wsToken = "ee3f9db9c91ca1c79eca7b7d644c93c7";

      try {
        const moodleResponse = await axios.get(moodleApiUrl, {
          params: {
            wsfunction: "local_users_login",
            wstoken: wsToken,
            moodlewsrestformat: "json",
            email: email,
            password: password,
          },
          timeout: 10000, // 10 second timeout
        });

        const moodleData: MoodleLoginResponse = moodleResponse.data;

        // Check if Moodle authentication failed
        if (!moodleData.status || !moodleData.userdata) {
          return res.status(401).json({
            message: moodleData.message || "Invalid credentials",
          });
        }

        // Parse the userdata JSON string
        const userData: MoodleUserData = JSON.parse(moodleData.userdata);

        // Check if user exists in our database
        let user = await prisma.user.findUnique({
          where: { email: userData.email },
        });

        if (user) {
          // Update existing user with latest data from Moodle
          user = await prisma.user.update({
            where: { email: userData.email },
            data: {
              name: `${userData.firstname} ${userData.lastname}`,
              phone: userData.phone1 || user.phone,
              city: userData.city || user.city,
              country: userData.country || user.country,
              address: userData.address || user.address,
              moodleId: userData.id,
              kycVerified: userData.kyc_verified === "approved",
              studentId: userData.student_id || user.studentId,
              lastLogin: new Date(),
              // Add other fields as needed
            },
          });
        } else {
          // Create new user with data from Moodle
          // Generate a hashed password (you might want to use a different approach)
          const hashedPassword = await bcrypt.hash(password, 10);

          user = await prisma.user.create({
            data: {
              email: userData.email,
              password: hashedPassword,
              name: `${userData.firstname} ${userData.lastname}`,
              phone: userData.phone1 || "",
              city: userData.city || "",
              country: userData.country || "",
              address: userData.address || "",
              moodleId: userData.id,
              kycVerified: userData.kyc_verified === "approved",
              studentId: userData.student_id || "",
              role: "LEARNER", // Default role, adjust as needed
              lastLogin: new Date(),
              // Add other fields as needed
            },
          });
        }

        // Generate JWT token
        const token = generateToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
        });

        // Return successful response with user data
        res.json({
          message: "Login successful",
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            phone: user.phone,
            city: user.city,
            country: user.country,
            address: user.address,
            kycVerified: user.kycVerified,
            studentId: user.studentId,
            moodleId: user.moodleId,
          },
          moodleData: userData, // Include original Moodle data if needed
        });
      } catch (moodleError) {
        console.error("Moodle API error:", moodleError);

        // If Moodle API fails, fall back to local authentication
        const localUser = await prisma.user.findUnique({
          where: { email },
        });

        if (!localUser) {
          return res.status(401).json({
            message:
              "Invalid credentials and unable to verify with external service",
          });
        }

        // Check password against local database
        const isPasswordValid = await bcrypt.compare(
          password,
          localUser.password
        );
        if (!isPasswordValid) {
          return res.status(401).json({ message: "Invalid credentials" });
        }

        // Generate token for local user
        const token = generateToken({
          userId: localUser.id,
          email: localUser.email,
          role: localUser.role,
          name: localUser.name,
        });

        res.json({
          message: "Login successful (local authentication)",
          token,
          user: {
            id: localUser.id,
            email: localUser.email,
            name: localUser.name,
            role: localUser.role,
          },
        });
      }
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
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
        },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ user });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ message: "Internal server error" });
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
        },
      }); // populated by your `authenticate` middleware
      if (!user) {
        return res.status(401).json({ message: "Invalid token" });
      }
      return res.status(200).json({ user });
    } catch (err) {
      console.error("Verify error:", err);
      return res.status(500).json({ message: "Token verification failed" });
    }
  };
}
