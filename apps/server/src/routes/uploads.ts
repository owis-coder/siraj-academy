import { Router } from "express";
import { multerSingle, uploadAny } from "../middleware/upload";
import { requireAuth } from "../middleware/auth";
import { badRequest } from "../lib/errors";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// POST /uploads (multipart: "file") — صور/PDF/ZIP حتى 25MB
// متاح لأي مستخدم مسجل (تُستخدم لصور السند، مرفقات الطلبات، وثائق المدرسين…)
// التخزين خاص: كل ملف يُقرأ عبر GET /uploads/:filename بعد تفويض في routes/files.ts.
router.post(
  "/",
  requireAuth(),
  multerSingle("file", uploadAny),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("أرفق ملفًا في الحقل file");
    res.status(201).json({
      data: {
        url: `/uploads/${req.file.filename}`,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
      message: "تم رفع الملف بنجاح",
    });
  }),
);

export default router;
