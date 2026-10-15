const prisma = require('../config/database');

const notificationService = {
  /**
   * Create a notification for a user
   */
  async notify(userId, { title, message, type, metadata = {} }) {
    try {
      const notification = await prisma.notification.create({
        data: { userId, title, message, type, metadata },
      });
      return notification;
    } catch (err) {
      // Never let notification failure crash the main flow
      console.error('Notification error:', err.message);
      return null;
    }
  },

  /**
   * Get notifications for a user
   */
  async getNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const where = { userId };
    if (unreadOnly) where.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { notifications, total, unreadCount, page, pages: Math.ceil(total / limit) };
  },

  /**
   * Mark notifications as read
   */
  async markAsRead(userId, notificationIds) {
    const where = { userId };
    if (notificationIds?.length) where.id = { in: notificationIds };

    await prisma.notification.updateMany({ where, data: { isRead: true } });
    return { message: 'Notifications marked as read.' };
  },

  /**
   * Get unread count
   */
  async getUnreadCount(userId) {
    const count = await prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  },
};

module.exports = notificationService;
