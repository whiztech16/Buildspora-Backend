import { Router } from "express";
import {
  getMilestoneDetail,
  checkIn,
  checkOut,
  uploadMilestonePhoto,
  submitMilestone,
  rejectMilestone,
} from "../controllers/milestones.controllers";
import { authMiddleware } from "../middleware/auth.middleware";
import { upload } from "../middleware/upload.middleware";

const router = Router();

router.get("/:id", authMiddleware, getMilestoneDetail);
router.post("/:id/checkin", authMiddleware, checkIn);
router.post("/:id/checkout", authMiddleware, checkOut);
router.post("/:id/photos", authMiddleware, upload.single("photo"), uploadMilestonePhoto);
router.put("/:id/submit", authMiddleware, submitMilestone);
router.put("/:id/reject", authMiddleware, rejectMilestone);

export default router;