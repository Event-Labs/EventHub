import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout.jsx'
import { BookingCheckoutPage } from '@/pages/customer/booking/BookingCheckoutPage.jsx'
import {
  BookingAttendeesPage,
  BookingPaymentPage,
  BookingReviewPage,
  BookingSeatsPage,
} from '@/pages/customer/booking/BookingFlowPages.jsx'
import { EventDetailPage } from '@/pages/customer/events/EventDetailPage.jsx'
import { EventsPage } from '@/pages/customer/events/EventsPage.jsx'
import { FavoriteEventsPage } from '@/pages/customer/favorites/FavoriteEventsPage.jsx'
import { FeedbackPage } from '@/pages/customer/FeedbackPage.jsx'
import { OrganizerBusinessEmailVerifyPage } from '@/pages/customer/OrganizerBusinessEmailVerifyPage.jsx'
import { OrganizerRequestPage } from '@/pages/customer/OrganizerRequestPage.jsx'
import { HomePage } from '@/pages/public/HomePage.jsx'
import { LoginPage } from '@/pages/auth/LoginPage.jsx'
import { LockedAccountPage } from '@/pages/auth/LockedAccountPage.jsx'
import { MyTicketsPage } from '@/pages/customer/tickets/MyTicketsPage.jsx'
import { NotificationsPage } from '@/pages/customer/NotificationsPage.jsx'
import { NotFoundPage } from '@/pages/public/NotFoundPage.jsx'
import { PaymentConfirmationPage } from '@/pages/customer/booking/PaymentConfirmationPage.jsx'
import {
  AdminAccountsPage,
  AdminAnalyticsPage,
  AdminEventCategoriesPage,
  AdminEventReviewPage,
  AdminFinancePage,
  AdminLayout,
  AdminOrganizerRequestsPage,
  AdminPlansPage,
  AdminProfilePage,
} from '@/pages/admin/AdminPages.jsx'
import { OrganizerAnnouncementsPage } from '@/pages/organizer/OrganizerAnnouncementsPage.jsx'
import { OrganizerAttendeesPage } from '@/pages/organizer/OrganizerAttendeesPage.jsx'
import { OrganizerOrdersPage } from '@/pages/organizer/OrganizerOrdersPage.jsx'
import { OrganizerDashboardPage as OrganizerPortalDashboardPage } from '@/pages/organizer/OrganizerDashboardPage.jsx'
import { OrganizerFeedbackReportPage } from '@/pages/organizer/OrganizerFeedbackReportPage.jsx'
import { CreateEventPage } from '@/pages/organizer/CreateEventPage.jsx'
import { OrganizerEventsPage } from '@/pages/organizer/OrganizerEventsPage.jsx'
import { OrganizerEventDetailPage } from '@/pages/organizer/OrganizerEventDetailPage.jsx'
import { OrganizerLayout } from '@/pages/organizer/OrganizerLayout.jsx'
import { OrganizerPromosPage } from '@/pages/organizer/OrganizerPromosPage.jsx'
import { OrganizerVenuesPage } from '@/pages/organizer/OrganizerVenuesPage.jsx'
import { OrganizerVenueSeatMapsPage } from '@/pages/organizer/OrganizerVenueSeatMapsPage.jsx'
import { OrganizerSubscriptionsPage } from '@/pages/organizer/OrganizerSubscriptionsPage.jsx'
import { OrganizerTasksPage } from '@/pages/organizer/OrganizerTasksPage.jsx'
import { OrganizerStaffManagementPage } from '@/pages/organizer/OrganizerStaffManagementPage.jsx'
import { OrganizerCheckinDashboardPage } from '@/pages/organizer/OrganizerCheckinDashboardPage.jsx'
import { OrganizerTicketSalesPage } from '@/pages/organizer/OrganizerTicketSalesPage.jsx'
import { OrganizerSubscriptionPaymentPage } from '@/pages/organizer/OrganizerSubscriptionPaymentPage.jsx'
import { OrganizerPaymentSettingsPage } from '@/pages/organizer/OrganizerPaymentSettingsPage.jsx'
import { StaffCheckInCountPage } from '@/pages/staff/StaffCheckInCountPage.jsx'
import { StaffDashboardPage as StaffPortalDashboardPage } from '@/pages/staff/StaffDashboardPage.jsx'
import { StaffDirectBookingPage } from '@/pages/staff/StaffDirectBookingPage.jsx'
import { StaffEventDetailPage } from '@/pages/staff/StaffEventDetailPage.jsx'
import { StaffEventsPage, NoAssignedEventsPage } from '@/pages/staff/StaffEventsPage.jsx'
import { StaffLayout } from '@/pages/staff/StaffLayout.jsx'
import { CameraDeniedPage, ManualCheckInPage, StaffQrCheckInPage } from '@/pages/staff/StaffQrCheckInPage.jsx'
import { TicketResultPage } from '@/pages/staff/StaffResultsPage.jsx'
import { StaffTasksPage } from '@/pages/staff/StaffTasksPage.jsx'
import { ProfilePage } from '@/pages/shared/ProfilePage.jsx'
import { PlatformPoliciesPage } from '@/pages/shared/PlatformPoliciesPage.jsx'
import { RegisterPage } from '@/pages/auth/RegisterPage.jsx'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage.jsx'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage.jsx'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage.jsx'
import { TicketDetailPage } from '@/pages/customer/tickets/TicketDetailPage.jsx'

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
        path: 'accounts',
        element: <AdminAccountsPage />,
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
        path: 'platform-fee',
        element: <AdminFinancePage />,
      },
      {
        path: 'finance',
        element: <AdminFinancePage />,
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
        path: 'staff-tasks',
        element: <OrganizerTasksPage />,
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
        path: 'events',
        element: <StaffEventsPage />,
      },
      {
        path: 'events/empty',
        element: <NoAssignedEventsPage />,
      },
      {
        path: 'events/detail',
        element: <StaffEventDetailPage />,
      },
      {
        path: 'tasks',
        element: <StaffTasksPage />,
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
