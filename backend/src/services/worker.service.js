const prisma = require('../config/database');
const { NotFoundError, ForbiddenError, AppError } = require('../utils/errors');

/**
 * Haversine formula — distance between two lat/lng points in km
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Score a worker against a job for matching
 * Max score: 100
 */
function scoreWorker(worker, job, userLat, userLng) {
  let score = 0;

  // Category match (40 points)
  const workerCategories = worker.categories?.map((wc) => wc.categoryId) || [];
  if (workerCategories.includes(job?.categoryId || '')) {
    score += 40;
  }

  // Availability (15 points)
  if (worker.availability === 'AVAILABLE') score += 15;
  else if (worker.availability === 'BUSY') score += 5;

  // Rating score (25 points)
  score += Math.min((worker.averageRating / 5) * 25, 25);

  // Distance score (20 points)
  if (userLat && userLng && worker.latitude && worker.longitude) {
    const distance = haversineDistance(userLat, userLng, worker.latitude, worker.longitude);
    if (distance <= 2) score += 20;
    else if (distance <= 5) score += 15;
    else if (distance <= 10) score += 10;
    else if (distance <= 20) score += 5;
    else score += 0;
  }

  return { score: Math.round(score), worker };
}

const workerService = {
  /**
   * Get all workers with filtering and matching
   */
  async getWorkers({
    categoryId,
    city,
    availability,
    minRating,
    maxPrice,
    maxDistance,
    latitude,
    longitude,
    search,
    verificationStatus,
    page = 1,
    limit = 20,
  }) {
    const where = {
      user: { status: 'ACTIVE' },
    };

    if (availability) where.availability = availability;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (minRating) where.averageRating = { gte: parseFloat(minRating) };
    if (maxPrice) where.startingPrice = { lte: parseFloat(maxPrice) };
    if (verificationStatus) where.verificationStatus = verificationStatus;

    if (categoryId) {
      where.categories = { some: { categoryId } };
    }

    if (search) {
      where.OR = [
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { bio: { contains: search, mode: 'insensitive' } },
        { skills: { some: { skill: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    const workers = await prisma.workerProfile.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, city: true } },
        categories: { include: { category: true } },
        skills: { include: { skill: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.workerProfile.count({ where });

    // Filter by distance if coordinates provided
    let filteredWorkers = workers;
    if (latitude && longitude) {
      filteredWorkers = workers
        .map((w) => {
          const dist = w.latitude && w.longitude
            ? haversineDistance(latitude, longitude, w.latitude, w.longitude)
            : 999;
          return { ...w, distance: dist };
        })
        .filter((w) => !maxDistance || w.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
    }

    return {
      workers: filteredWorkers,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  },

  /**
   * Get worker profile by ID
   */
  async getWorkerById(workerProfileId) {
    const worker = await prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, city: true, createdAt: true } },
        categories: { include: { category: true } },
        skills: { include: { skill: true } },
        portfolioImages: true,
        reviews: {
          include: {
            job: {
              include: {
                customerProfile: {
                  include: { user: { select: { fullName: true, avatarUrl: true } } },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!worker) throw new NotFoundError('Worker');
    return worker;
  },

  /**
   * Get worker profile for the current authenticated user
   */
  async getMyWorkerProfile(userId) {
    const worker = await prisma.workerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, city: true } },
        categories: { include: { category: true } },
        skills: { include: { skill: true } },
        portfolioImages: true,
      },
    });

    if (!worker) throw new NotFoundError('Worker profile');
    return worker;
  },

  /**
   * Update worker profile
   */
  async updateWorkerProfile(userId, data) {
    const worker = await prisma.workerProfile.findUnique({ where: { userId } });
    if (!worker) throw new NotFoundError('Worker profile');

    const { categoryIds, skills, ...profileData } = data;

    // Update categories if provided
    if (categoryIds !== undefined) {
      await prisma.workerCategory.deleteMany({ where: { workerProfileId: worker.id } });
      if (categoryIds.length > 0) {
        await prisma.workerCategory.createMany({
          data: categoryIds.map((cid) => ({ workerProfileId: worker.id, categoryId: cid })),
          skipDuplicates: true,
        });
      }
    }

    // Update skills if provided
    if (skills !== undefined) {
      await prisma.workerSkill.deleteMany({ where: { workerProfileId: worker.id } });
      if (skills.length > 0) {
        const skillRecords = await Promise.all(
          skills.map((name) =>
            prisma.skill.upsert({ where: { name }, update: {}, create: { name } })
          )
        );
        await prisma.workerSkill.createMany({
          data: skillRecords.map((s) => ({ workerProfileId: worker.id, skillId: s.id })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await prisma.workerProfile.update({
      where: { id: worker.id },
      data: profileData,
      include: {
        categories: { include: { category: true } },
        skills: { include: { skill: true } },
        portfolioImages: true,
      },
    });

    return updated;
  },

  /**
   * Update availability
   */
  async updateAvailability(userId, availability) {
    const worker = await prisma.workerProfile.findUnique({ where: { userId } });
    if (!worker) throw new NotFoundError('Worker profile');

    return prisma.workerProfile.update({
      where: { id: worker.id },
      data: { availability },
    });
  },

  /**
   * Find matching workers for a job
   */
  async findMatchingWorkers(jobId, userLat, userLng) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { category: true },
    });
    if (!job) throw new NotFoundError('Job');

    const workers = await prisma.workerProfile.findMany({
      where: {
        availability: 'AVAILABLE',
        user: { status: 'ACTIVE' },
        categories: { some: { categoryId: job.categoryId } },
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true, city: true } },
        categories: { include: { category: true } },
        skills: { include: { skill: true } },
      },
    });

    const scored = workers
      .map((w) => scoreWorker(w, job, userLat || job.latitude, userLng || job.longitude))
      .sort((a, b) => b.score - a.score);

    return scored;
  },
};

module.exports = { workerService, haversineDistance };
