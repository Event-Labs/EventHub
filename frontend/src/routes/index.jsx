import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout.jsx'
import { HomePage } from '@/pages/public/HomePage.jsx'
import { EventsPage } from '@/pages/customer/events/EventsPage.jsx'
import { EventDetailPage } from '@/pages/customer/events/EventDetailPage.jsx'
import { AdminNotificationsPage } from '@/pages/admin/AdminNotificationsPage.jsx'
import { OrganizerNotificationsPage } from '@/pages/organizer/OrganizerNotificationsPage.jsx'
import { StaffNotificationsPage } from '@/pages/staff/StaffNotificationsPage.jsx'

// Helper for lazy loading named exports
const lazyNamed = (importer, name) =>
  lazy(() => importer().then((m) => ({ default: m[name] || m.default })))

// Booking
const BookingCheckoutPage = lazyNamed(() => import('@/pages/customer/booking/BookingCheckoutPage.jsx'), 'BookingCheckoutPage')
const BookingAttendeesPage = lazyNamed(() => import('@/pages/customer/booking/BookingFlowPages.jsx'), 'BookingAttendeesPage')
const BookingPaymentPage = lazyNamed(() => import('@/pages/customer/booking/BookingFlowPages.jsx'), 'BookingPaymentPage')
const BookingReviewPage = lazyNamed(() => import('@/pages/customer/booking/BookingFlowPages.jsx'), 'BookingReviewPage')
const BookingSeatsPage = lazyNamed(() => import('@/pages/customer/booking/BookingFlowPages.jsx'), 'BookingSeatsPage')
const PaymentConfirmationPage = lazyNamed(() => import('@/pages/customer/booking/PaymentConfirmationPage.jsx'), 'PaymentConfirmationPage')

// Customer Secondary
const WaitingRoomPage = lazyNamed(() => import('@/pages/customer/waiting-room/WaitingRoomPage.jsx'), 'WaitingRoomPage')
const FavoriteEventsPage = lazyNamed(() => import('@/pages/customer/favorites/FavoriteEventsPage.jsx'), 'FavoriteEventsPage')
const FeedbackPage = lazyNamed(() => import('@/pages/customer/FeedbackPage.jsx'), 'FeedbackPage')
const CustomerComplaintsPage = lazyNamed(() => import('@/pages/customer/CustomerComplaintsPage.jsx'), 'CustomerComplaintsPage')
const OrganizerBusinessEmailVerifyPage = lazyNamed(() => import('@/pages/customer/OrganizerBusinessEmailVerifyPage.jsx'), 'OrganizerBusinessEmailVerifyPage')
const OrganizerRequestPage = lazyNamed(() => import('@/pages/customer/OrganizerRequestPage.jsx'), 'OrganizerRequestPage')
const MyTicketsPage = lazyNamed(() => import('@/pages/customer/tickets/MyTicketsPage.jsx'), 'MyTicketsPage')
const TicketDetailPage = lazyNamed(() => import('@/pages/customer/tickets/TicketDetailPage.jsx'), 'TicketDetailPage')
const NotificationsPage = lazyNamed(() => import('@/pages/customer/NotificationsPage.jsx'), 'NotificationsPage')
const NotFoundPage = lazyNamed(() => import('@/pages/public/NotFoundPage.jsx'), 'NotFoundPage')
const ProfilePage = lazyNamed(() => import('@/pages/shared/ProfilePage.jsx'), 'ProfilePage')
const PlatformPoliciesPage = lazyNamed(() => import('@/pages/shared/PlatformPoliciesPage.jsx'), 'PlatformPoliciesPage')

// Auth
const LoginPage = lazyNamed(() => import('@/pages/auth/LoginPage.jsx'), 'LoginPage')
const LockedAccountPage = lazyNamed(() => import('@/pages/auth/LockedAccountPage.jsx'), 'LockedAccountPage')
const RegisterPage = lazyNamed(() => import('@/pages/auth/RegisterPage.jsx'), 'RegisterPage')
const ForgotPasswordPage = lazyNamed(() => import('@/pages/auth/ForgotPasswordPage.jsx'), 'ForgotPasswordPage')
const VerifyEmailPage = lazyNamed(() => import('@/pages/auth/VerifyEmailPage.jsx'), 'VerifyEmailPage')
const ResetPasswordPage = lazyNamed(() => import('@/pages/auth/ResetPasswordPage.jsx'), 'ResetPasswordPage')

// Admin
const AdminLayout = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminLayout')
const AdminAccountsPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminAccountsPage')
const AdminAnalyticsPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminAnalyticsPage')
const AdminEventCategoriesPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminEventCategoriesPage')
const AdminEventReviewPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminEventReviewPage')
const AdminFinancePage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminFinancePage')
const AdminOrganizerDetailPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminOrganizerDetailPage')
const AdminOrganizersPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminOrganizersPage')
const AdminOrganizerRequestsPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminOrganizerRequestsPage')
const AdminPlansPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminPlansPage')
const AdminProfilePage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminProfilePage')
const AdminEventReviewDetailPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminEventReviewDetailPage')
const AdminEventCancellationDetailPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminEventCancellationDetailPage')
const AdminDevicesPage = lazyNamed(() => import('@/pages/admin/AdminPages.jsx'), 'AdminDevicesPage')
const AdminDisputesPage = lazyNamed(() => import('@/pages/admin/AdminDisputesPage.jsx'), 'AdminDisputesPage')

// Organizer
const OrganizerLayout = lazyNamed(() => import('@/pages/organizer/OrganizerLayout.jsx'), 'OrganizerLayout')
const OrganizerPortalDashboardPage = lazyNamed(() => import('@/pages/organizer/OrganizerDashboardPage.jsx'), 'OrganizerDashboardPage')
const OrganizerEventsPage = lazyNamed(() => import('@/pages/organizer/OrganizerEventsPage.jsx'), 'OrganizerEventsPage')
const CreateEventPage = lazyNamed(() => import('@/pages/organizer/CreateEventPage.jsx'), 'CreateEventPage')
const OrganizerEventDetailPage = lazyNamed(() => import('@/pages/organizer/OrganizerEventDetailPage.jsx'), 'OrganizerEventDetailPage')
const OrganizerAttendeesPage = lazyNamed(() => import('@/pages/organizer/OrganizerAttendeesPage.jsx'), 'OrganizerAttendeesPage')
const OrganizerCheckinDashboardPage = lazyNamed(() => import('@/pages/organizer/OrganizerCheckinDashboardPage.jsx'), 'OrganizerCheckinDashboardPage')
const OrganizerTicketSalesPage = lazyNamed(() => import('@/pages/organizer/OrganizerTicketSalesPage.jsx'), 'OrganizerTicketSalesPage')
const OrganizerOrdersPage = lazyNamed(() => import('@/pages/organizer/OrganizerOrdersPage.jsx'), 'OrganizerOrdersPage')
const OrganizerRefundsPage = lazyNamed(() => import('@/pages/organizer/OrganizerRefundsPage.jsx'), 'OrganizerRefundsPage')
const OrganizerRefundDetailPage = lazyNamed(() => import('@/pages/organizer/OrganizerRefundDetailPage.jsx'), 'OrganizerRefundDetailPage')
const OrganizerStaffManagementPage = lazyNamed(() => import('@/pages/organizer/OrganizerStaffManagementPage.jsx'), 'OrganizerStaffManagementPage')
const OrganizerFeedbackReportPage = lazyNamed(() => import('@/pages/organizer/OrganizerFeedbackReportPage.jsx'), 'OrganizerFeedbackReportPage')
const OrganizerPromosPage = lazyNamed(() => import('@/pages/organizer/OrganizerPromosPage.jsx'), 'OrganizerPromosPage')
const OrganizerVenuesPage = lazyNamed(() => import('@/pages/organizer/OrganizerVenuesPage.jsx'), 'OrganizerVenuesPage')
const OrganizerVenueSeatMapsPage = lazyNamed(() => import('@/pages/organizer/OrganizerVenueSeatMapsPage.jsx'), 'OrganizerVenueSeatMapsPage')
const OrganizerAnnouncementsPage = lazyNamed(() => import('@/pages/organizer/OrganizerAnnouncementsPage.jsx'), 'OrganizerAnnouncementsPage')
const OrganizerSubscriptionsPage = lazyNamed(() => import('@/pages/organizer/OrganizerSubscriptionsPage.jsx'), 'OrganizerSubscriptionsPage')
const OrganizerSubscriptionPaymentPage = lazyNamed(() => import('@/pages/organizer/OrganizerSubscriptionPaymentPage.jsx'), 'OrganizerSubscriptionPaymentPage')
const OrganizerPaymentSettingsPage = lazyNamed(() => import('@/pages/organizer/OrganizerPaymentSettingsPage.jsx'), 'OrganizerPaymentSettingsPage')

// Staff
const StaffLayout = lazyNamed(() => import('@/pages/staff/StaffLayout.jsx'), 'StaffLayout')
const StaffPortalDashboardPage = lazyNamed(() => import('@/pages/staff/StaffDashboardPage.jsx'), 'StaffDashboardPage')
const StaffEventsPage = lazyNamed(() => import('@/pages/staff/StaffEventsPage.jsx'), 'StaffEventsPage')
const NoAssignedEventsPage = lazyNamed(() => import('@/pages/staff/StaffEventsPage.jsx'), 'NoAssignedEventsPage')
const StaffEventDetailPage = lazyNamed(() => import('@/pages/staff/StaffEventDetailPage.jsx'), 'StaffEventDetailPage')
const StaffDirectBookingPage = lazyNamed(() => import('@/pages/staff/StaffDirectBookingPage.jsx'), 'StaffDirectBookingPage')
const StaffQrCheckInPage = lazyNamed(() => import('@/pages/staff/StaffQrCheckInPage.jsx'), 'StaffQrCheckInPage')
const CameraDeniedPage = lazyNamed(() => import('@/pages/staff/StaffQrCheckInPage.jsx'), 'CameraDeniedPage')
const ManualCheckInPage = lazyNamed(() => import('@/pages/staff/StaffQrCheckInPage.jsx'), 'ManualCheckInPage')
const TicketResultPage = lazyNamed(() => import('@/pages/staff/StaffResultsPage.jsx'), 'TicketResultPage')
const StaffCheckInCountPage = lazyNamed(() => import('@/pages/staff/StaffCheckInCountPage.jsx'), 'StaffCheckInCountPage')

export const router = createBrowserRouter([
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <AdminAnalyticsPage />,
      },
      {
        path: 'notifications',
        element: <AdminNotificationsPage />,
      },
      {
        path: 'accounts',
        element: <AdminAccountsPage />,
      },
      {
        path: 'organizers',
        element: <AdminOrganizersPage />,
      },
      {
        path: 'organizers/:organizerId',
        element: <AdminOrganizerDetailPage />,
      },
      {
        path: 'organizer-requests',
        element: <AdminOrganizerRequestsPage />,
      },
      {
        path: 'manage-account',
        element: <AdminAccountsPage />,
      },
      {
        path: 'event-review',
        element: <AdminEventReviewPage />,
      },
      {
        path: 'events',
        element: <Navigate to="/admin/events/review" replace />,
      },
      {
        path: 'events/categories',
        element: <AdminEventCategoriesPage />,
      },
      {
        path: 'events/review',
        element: <AdminEventReviewPage />,
      },
      {
        path: 'events/review/:eventId',
        element: <AdminEventReviewDetailPage />,
      },
      {
        path: 'events/cancellations',
        element: <Navigate to="/admin/events/review" replace />,
      },
      {
        path: 'events/cancellations/:eventId',
        element: <AdminEventCancellationDetailPage />,
      },
      {
        path: 'devices',
        element: <AdminDevicesPage />,
      },
      {
        path: 'platform-fee',
        element: <AdminFinancePage />,
      },
      {
        path: 'finance',
        element: <AdminFinancePage />,
      },
      {
        path: 'disputes',
        element: <AdminDisputesPage />,
      },
      {
        path: 'refunds',
        element: <Navigate to="/admin/disputes" replace />,
      },
      {
        path: 'plans',
        element: <AdminPlansPage />,
      },
      {
        path: 'profile',
        element: <AdminProfilePage />,
      },
    ],
  },
  {
    path: '/organizer',
    element: <OrganizerLayout />,
    children: [
      {
        index: true,
        element: <OrganizerPortalDashboardPage />,
      },
      {
        path: 'notifications',
        element: <OrganizerNotificationsPage />,
      },
      {
        path: 'events',
        element: <OrganizerEventsPage />,
      },
      {
        path: 'events/create',
        element: <CreateEventPage />,
      },
      {
        path: 'events/:eventId/edit',
        element: <CreateEventPage />,
      },
      {
        path: 'events/:eventId',
        element: <OrganizerEventDetailPage />,
      },
      {
        path: 'attendees',
        element: <OrganizerAttendeesPage />,
      },
      {
        path: 'checkin-dashboard',
        element: <OrganizerCheckinDashboardPage />,
      },
      {
        path: 'ticket-sales',
        element: <OrganizerTicketSalesPage />,
      },
      {
        path: 'orders',
        element: <OrganizerOrdersPage />,
      },
      {
        path: 'refunds',
        element: <OrganizerRefundsPage />,
      },
      {
        path: 'refunds/:refundId',
        element: <OrganizerRefundDetailPage />,
      },
      {
        path: 'staff-management',
        element: <OrganizerStaffManagementPage />,
      },
      {
        path: 'reports',
        element: <OrganizerFeedbackReportPage />,
      },
      {
        path: 'promotions',
        element: <OrganizerPromosPage />,
      },
      {
        path: 'venues',
        element: <OrganizerVenuesPage />,
      },
      {
        path: 'venues/:venueId/seat-maps',
        element: <OrganizerVenueSeatMapsPage />,
      },
      {
        path: 'announcements',
        element: <OrganizerAnnouncementsPage />,
      },
      {
        path: 'subscriptions',
        element: <OrganizerSubscriptionsPage />,
      },
      {
        path: 'subscriptions/payment-result',
        element: <OrganizerSubscriptionPaymentPage />,
      },
      {
        path: 'policies',
        element: <PlatformPoliciesPage audience="organizer" />,
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: 'settings/payment',
        element: <OrganizerPaymentSettingsPage />,
      },
      {
        path: '*',
        element: <OrganizerPortalDashboardPage />,
      },
    ],
  },
  {
    path: '/staff',
    element: <StaffLayout />,
    children: [
      {
        index: true,
        element: <StaffPortalDashboardPage />,
      },
      {
        path: 'notifications',
        element: <StaffNotificationsPage />,
      },
      {
        path: 'events',
        element: <StaffEventsPage />,
      },
      {
        path: 'events/empty',
        element: <NoAssignedEventsPage />,
      },
      {
        path: 'events/:eventId',
        element: <StaffEventDetailPage />,
      },
      {
        path: 'direct-booking',
        element: <StaffDirectBookingPage />,
      },
      {
        path: 'qr-check-in',
        element: <StaffQrCheckInPage />,
      },
      {
        path: 'qr-check-in/camera-denied',
        element: <CameraDeniedPage />,
      },
      {
        path: 'qr-check-in/valid',
        element: <TicketResultPage state="valid" />,
      },
      {
        path: 'qr-check-in/invalid',
        element: <TicketResultPage state="invalid" />,
      },
      {
        path: 'qr-check-in/already',
        element: <TicketResultPage state="already" />,
      },
      {
        path: 'qr-check-in/success',
        element: <TicketResultPage state="success" />,
      },
      {
        path: 'manual-check-in',
        element: <ManualCheckInPage />,
      },
      {
        path: 'check-in-count',
        element: <StaffCheckInCountPage />,
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: '*',
        element: <StaffPortalDashboardPage />,
      },
    ],
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'events',
        element: <EventsPage />,
      },
      {
        path: 'events/:eventId',
        element: <EventDetailPage />,
      },
      {
        path: 'events/:eventId/queue',
        element: <WaitingRoomPage />,
      },
      {
        path: 'booking',
        element: <Navigate to="/events" replace />,
      },
      {
        path: 'booking/checkout',
        element: <BookingCheckoutPage />,
      },
      {
        path: 'booking/seats',
        element: <BookingSeatsPage />,
      },
      {
        path: 'booking/attendees',
        element: <BookingAttendeesPage />,
      },
      {
        path: 'booking/review',
        element: <BookingReviewPage />,
      },
      {
        path: 'booking/payment',
        element: <BookingPaymentPage />,
      },
      {
        path: 'payment-confirmation',
        element: <PaymentConfirmationPage />,
      },
      {
        path: 'my-tickets',
        element: <MyTicketsPage />,
      },
      {
        path: 'tickets/:ticketId',
        element: <TicketDetailPage />,
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'locked-account',
        element: <LockedAccountPage />,
      },
      {
        path: 'register',
        element: <RegisterPage />,
      },
      {
        path: 'forgot-password',
        element: <ForgotPasswordPage />,
      },
      {
        path: 'verify-email',
        element: <VerifyEmailPage />,
      },
      {
        path: 'reset-password',
        element: <ResetPasswordPage />,
      },
      {
        path: 'favorites',
        element: <FavoriteEventsPage />,
      },
      {
        path: 'feedback',
        element: <FeedbackPage />,
      },
      {
        path: 'complaints',
        element: <CustomerComplaintsPage />,
      },
      {
        path: 'policies',
        element: <PlatformPoliciesPage />,
      },
      {
        path: 'notifications',
        element: <NotificationsPage />,
      },
      {
        path: 'organizer-request',
        element: <OrganizerRequestPage />,
      },
      {
        path: 'organizer-request/verify-email',
        element: <OrganizerBusinessEmailVerifyPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])
