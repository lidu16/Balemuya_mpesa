const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth.middleware');
const prisma = require('../config/database');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Ensure upload directories exist
['profiles', 'jobs', 'portfolio'].forEach((dir) => {
  fs.mkdirSync(path.join(UPLOAD_DIR, dir), { recursive: true });
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
  },
});

/**
 * Process and save image with sharp
 */
async function processAndSaveImage(buffer, subDir, width = 800) {
  const filename = `${uuidv4()}.webp`;
  const outputPath = path.join(UPLOAD_DIR, subDir, filename);

  await sharp(buffer)
    .resize(width, null, { withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: 80 })
    .toFile(outputPath);

  return `/uploads/${subDir}/${filename}`;
}

// POST /api/upload/avatar — upload profile picture
router.post('/avatar', authenticate, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const imageUrl = await processAndSaveImage(req.file.buffer, 'profiles', 400);
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: imageUrl } });

    res.json({ success: true, data: { url: imageUrl } });
  } catch (err) { next(err); }
});

// POST /api/upload/portfolio — upload portfolio image (worker)
router.post('/portfolio', authenticate, upload.single('image'), async (req, res, next) => {
  try {
    if (req.user.role !== 'WORKER') return res.status(403).json({ success: false, message: 'Workers only.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const imageUrl = await processAndSaveImage(req.file.buffer, 'portfolio');
    const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: req.user.id } });

    const portfolioImage = await prisma.portfolioImage.create({
      data: { workerProfileId: workerProfile.id, imageUrl, caption: req.body.caption || '' },
    });

    res.json({ success: true, data: { url: imageUrl, id: portfolioImage.id } });
  } catch (err) { next(err); }
});

// POST /api/upload/job — upload job image
router.post('/job/:jobId', authenticate, upload.array('images', 5), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files uploaded.' });

    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      include: { customerProfile: true },
    });
    if (!job || job.customerProfile.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    const imageUrls = await Promise.all(
      req.files.map((file) => processAndSaveImage(file.buffer, 'jobs'))
    );

    await prisma.jobImage.createMany({
      data: imageUrls.map((url) => ({ jobId: req.params.jobId, imageUrl: url })),
    });

    res.json({ success: true, data: { urls: imageUrls } });
  } catch (err) { next(err); }
});

module.exports = router;
