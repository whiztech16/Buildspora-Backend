import { Router } from "express";
import { getMe, completeProfile, uploadAvatar } from "../controllers/user.controllers";
import { authMiddleware } from "../middleware/auth.middleware";
import { upload } from "../middleware/upload.middleware";
import { getToken, createVirtualAccount } from "../services/nomba.service";

const router = Router();

router.get("/me", authMiddleware, getMe);
router.patch("/profile", authMiddleware, completeProfile);
router.post("/avatar", authMiddleware, upload.single("avatar"), uploadAvatar);

// TEMP - remove after testing
router.get("/test-nomba-token", async (req, res) => {
  try {
    const token = await getToken();
    res.json({ success: true, token });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// TEMP - remove after testing
router.get("/test-nomba-va", async (req, res) => {
  try {
    const va = await createVirtualAccount({
      accountRef: `TEST-${Date.now()}`, // unique, disposable — not a real user id
      accountName: "Test Account BuildSpora",
    });
    res.json({ success: true, virtualAccount: va });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;