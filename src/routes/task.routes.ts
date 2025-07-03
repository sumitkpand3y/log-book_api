// routes/taskRoutes.ts

import { Router } from "express";
import { TaskController } from "../controllers/task.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { taskValidation } from "../middlewares/validation";

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Task CRUD operations
router.get("/", TaskController.getAllTasks);
// router.get('/stats', TaskController.getTaskStats);
router.get("/review", TaskController.getTasksForReview);
router.get("/:id", TaskController.getTaskById);
router.post("/", taskValidation.create, TaskController.createTask);
router.put("/:id", TaskController.updateTask);
router.delete("/:id", TaskController.deleteTask);

// Task workflow operations
router.post("/:id/approve", TaskController.approveTask);
router.post("/:id/reject", TaskController.rejectTask);

// Bulk operations (Admin only)
// router.post('/bulk-action', TaskController.bulkAction);

export default router;
