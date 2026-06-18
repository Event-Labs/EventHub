const express = require('express');
const cookieParser = require('cookie-parser');
const securityMiddlewares = require('./middlewares/security.middleware');
const errorMiddleware = require('./middlewares/error.middleware');
const authRoutes = require('./modules/auth/auth.routes');
const adminEventCategoryRoutes = require('./modules/admin/eventCategories.routes');
const adminOrganizerRequestRoutes = require('./modules/admin/organizerRequests.routes');
const adminSubscriptionRoutes = require('./modules/admin/subscriptions.routes');
const adminPlatformFinanceRoutes = require('./modules/admin/platformFinance.routes');
const adminUserRoutes = require('./modules/admin/users.routes');
const adminEventsRoutes = require('./modules/admin/events.routes');
const adminAnalyticsRoutes = require('./modules/admin/analytics.routes');

const organizerRequestRoutes = require('./modules/organizer-requests/organizerRequests.routes');
const feedbackRoutes = require('./modules/feedbacks/feedbacks.routes');
const organizerFeedbackRoutes = require('./modules/organizer/feedbackReport.routes');
const organizerEventsRoutes = require('./modules/organizer/organizerEvents.routes');
const organizerVenuesRoutes = require('./modules/organizer/venues.routes');
const organizerSeatMapsRoutes = require('./modules/organizer/seatMaps.routes');
const organizerSubscriptionsRoutes = require('./modules/organizer-subscriptions/organizerSubscriptions.routes');
const organizerPaymentsRoutes = require('./modules/organizer-payments/organizerPayments.routes');
const organizerOrdersRoutes = require('./modules/organizer/organizerOrders.routes');
const aiFaqRoutes = require('./modules/ai-faq/aiFaq.routes');

const orderRoutes = require('./modules/orders/orders.routes');
const paymentRoutes = require('./modules/payments/payments.routes');
const ticketRoutes = require('./modules/tickets/tickets.routes');
const eventRoutes = require('./modules/events/events.routes');
const notificationRoutes = require('./modules/notifications/notifications.routes');
const announcementRoutes = require('./modules/announcements/announcements.routes');
const platformPolicyRoutes = require('./modules/platform-policies/platformPolicies.routes');
const uploadRoutes = require('./modules/uploads/uploads.routes');
const userRoutes = require('./modules/user/user.routes');
const promotionRoutes = require('./modules/promotions/promotions.routes');
const operationsRoutes = require('./modules/operations/operations.routes');
const ApiResponse = require('./core/response/ApiResponse');

const app = express();

// Security Middlewares
securityMiddlewares(app);

// JSON and URL parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie Parser
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/event-categories', adminEventCategoryRoutes);
app.use('/api/admin/organizer-requests', adminOrganizerRequestRoutes);
app.use('/api/admin/subscriptions', adminSubscriptionRoutes);
app.use('/api/admin/platform-finance', adminPlatformFinanceRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/events', adminEventsRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/organizer-requests', organizerRequestRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/organizer/feedback', organizerFeedbackRoutes);
app.use('/api/organizer/events', organizerEventsRoutes);
app.use('/api/organizer/venues', organizerVenuesRoutes);
app.use('/api/organizer/seat-maps', organizerSeatMapsRoutes);
app.use('/api/organizer/subscriptions', organizerSubscriptionsRoutes);
app.use('/api/organizer/payments', organizerPaymentsRoutes);
app.use('/api/organizer/orders', organizerOrdersRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/ai-faq', aiFaqRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/platform-policies', platformPolicyRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/operations', operationsRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json(ApiResponse.success(null, 'Server is healthy'));
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).json(ApiResponse.error('Route not found', 404, 'RESOURCE_NOT_FOUND'));
});

// Global Error Handler
app.use(errorMiddleware);

module.exports = app;
