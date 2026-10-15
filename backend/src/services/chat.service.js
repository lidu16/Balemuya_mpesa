const prisma = require('../config/database');
const { NotFoundError, ForbiddenError, AppError } = require('../utils/errors');
const notificationService = require('./notification.service');

const chatService = {
  /**
   * Get or create a conversation for a job
   */
  async getOrCreateConversation(jobId, requestingUser) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        customerProfile: { include: { user: true } },
        conversation: { include: { participants: true } },
      },
    });
    if (!job) throw new NotFoundError('Job');

    // Check access
    const customerId = job.customerProfile.userId;
    const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: requestingUser.id } });

    const isCustomer = requestingUser.id === customerId;
    const isSelectedWorker = workerProfile && job.selectedWorkerId === workerProfile.id;
    const isAdmin = requestingUser.role === 'ADMIN';

    if (!isCustomer && !isSelectedWorker && !isAdmin) {
      throw new ForbiddenError('You do not have access to this conversation.');
    }

    if (job.conversation) return job.conversation;

    // Create new conversation with participants
    const participantIds = [customerId];
    if (workerProfile && job.selectedWorkerId === workerProfile.id) {
      participantIds.push(requestingUser.id);
    } else if (isAdmin) {
      participantIds.push(requestingUser.id);
    }

    const conversation = await prisma.conversation.create({
      data: {
        jobId,
        participants: {
          create: [...new Set(participantIds)].map((uid) => ({ userId: uid })),
        },
      },
      include: { participants: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } } },
    });

    return conversation;
  },

  /**
   * Get all conversations for a user
   */
  async getUserConversations(userId) {
    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true, role: true } } },
        },
        job: {
          select: { id: true, title: true, status: true, category: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Add unread count per conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await prisma.message.count({
          where: { conversationId: conv.id, senderId: { not: userId }, isRead: false },
        });
        return { ...conv, unreadCount };
      })
    );

    return conversationsWithUnread;
  },

  /**
   * Get messages in a conversation
   */
  async getMessages(conversationId, userId, { page = 1, limit = 50 } = {}) {
    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new ForbiddenError('You do not have access to this conversation.');

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId },
        include: { sender: { select: { id: true, fullName: true, avatarUrl: true, role: true } } },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.message.count({ where: { conversationId } }),
    ]);

    // Mark messages as read
    await prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, isRead: false },
      data: { isRead: true },
    });

    return { messages, total, page, pages: Math.ceil(total / limit) };
  },

  /**
   * Send a message
   */
  async sendMessage(conversationId, senderId, content, io) {
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: senderId } },
    });
    if (!participant) throw new ForbiddenError('You are not a participant in this conversation.');

    if (!content || content.trim().length === 0) {
      throw new AppError('Message cannot be empty.', 400, 'VALIDATION_ERROR');
    }

    const message = await prisma.message.create({
      data: { conversationId, senderId, content: content.trim() },
      include: { sender: { select: { id: true, fullName: true, avatarUrl: true } } },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Notify other participants
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: senderId } },
    });

    for (const p of participants) {
      await notificationService.notify(p.userId, {
        title: 'New Message',
        message: content.length > 80 ? content.substring(0, 80) + '...' : content,
        type: 'NEW_MESSAGE',
        metadata: { conversationId, messageId: message.id },
      });
    }

    // Emit via Socket.IO if available
    if (io) {
      io.to(`conversation_${conversationId}`).emit('new_message', message);
    }

    return message;
  },
};

module.exports = chatService;
