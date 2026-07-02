import { Router } from "express";
import { createProject, getProjects, getProjectById } from "../controllers/project.controllers";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authMiddleware, createProject);
router.get("/", authMiddleware, getProjects);
router.get("/:id", authMiddleware, getProjectById);

export default router;