import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { uploadRequestPhoto, publicUrlFor } from "../uploads";

export const photosRouter = Router();
photosRouter.use(requireAuth);

// POST /requests/:id/photos — client attaches a photo of the issue (multipart/form-data, field "photo").
photosRouter.post("/:id/photos", requireRole("CLIENT"), (req, res) => {
  uploadRequestPhoto(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No photo uploaded (expected field 'photo')" });

    const request = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: "Not found" });
    if (request.clientId !== req.auth!.userId) return res.status(403).json({ error: "Not your request" });

    const photo = await prisma.requestPhoto.create({
      data: { requestId: request.id, url: publicUrlFor("requests", req.file.filename) },
    });
    return res.status(201).json({ photo });
  });
});
