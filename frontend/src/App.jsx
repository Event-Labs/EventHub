import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AppLayout } from '@/layouts/AppLayout.jsx'
import {
  BookingAttendeesPage,
  BookingPaymentPage,
  BookingReviewPage,
  BookingSeatsPage,
} from '@/pages/customer/BookingFlowPages.jsx'
import { CustomerDiscoveryPage } from '@/pages/CustomerDiscoveryPage.jsx'
import { EventDetailPage } from '@/pages/EventDetailPage.jsx'
import { EventsPage } from '@/pages/EventsPage.jsx'
import { FavoriteEventsPage } from '@/pages/FavoriteEventsPage.jsx'
import { HomePage } from '@/pages/HomePage.jsx'
import { LoginPage } from '@/pages/auth/LoginPage.jsx'
import { MyTicketsPage } from '@/pages/customer/MyTicketsPage.jsx'
import { NotFoundPage } from '@/pages/NotFoundPage.jsx'
import { PaymentConfirmationPage } from '@/pages/customer/PaymentConfirmationPage.jsx'
import {
  AIFaqPage,
  AttendeeListPage,
  CreateEventWizardPage,
  FeedbackPage,
  NotificationsPage,
  OnSiteBookingPage,
  OrderListPage,
  OrganizerDashboardPage,
  OrganizerEventListPage,
  OrganizerRequestPage,
  QrCheckInPage,
  RequestRefundPage,
  RevenueDashboardPage,
  StaffDashboardPage,
} from '@/pages/PlatformPages.jsx'
import {
  AdminAccountsPage,
  AdminAnalyticsPage,
  AdminEventReviewPage,
  AdminFinancePage,
  AdminLayout,
  AdminPlansPage,
} from '@/pages/admin/AdminPages.jsx'
import { OrganizerAnnouncementsPage } from '@/pages/organizer/OrganizerAnnouncementsPage.jsx'
import { OrganizerAttendeesPage } from '@/pages/organizer/OrganizerAttendeesPage.jsx'
import { OrganizerDashboardPage as OrganizerPortalDashboardPage } from '@/pages/organizer/OrganizerDashboardPage.jsx'
import { OrganizerEventsPage } from '@/pages/organizer/OrganizerEventsPage.jsx'
import { OrganizerLayout } from '@/pages/organizer/OrganizerLayout.jsx'
import { OrganizerPromosPage } from '@/pages/organizer/OrganizerPromosPage.jsx'
import { OrganizerTasksPage } from '@/pages/organizer/OrganizerTasksPage.jsx'
import { ProfilePage } from '@/pages/ProfilePage.jsx'
import { RegisterPage } from '@/pages/auth/RegisterPage.jsx'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage.jsx'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage.jsx'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage.jsx'
import { TicketDetailPage } from '@/pages/customer/TicketDetailPage.jsx'

const router = createBrowserRouter([
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
        path: 'manage-account',
        element: <AdminAccountsPage />,
      },
      {
        path: 'event-review',
        element: <AdminEventReviewPage />,
      },
      {
        path: 'events',
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
        element: <ProfilePage />,
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
        path: 'attendees',
        element: <OrganizerAttendeesPage />,
      },
      {
        path: 'staff-tasks',
        element: <OrganizerTasksPage />,
      },
      {
        path: 'promotions',
        element: <OrganizerPromosPage />,
      },
      {
        path: 'announcements',
        element: <OrganizerAnnouncementsPage />,
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: '*',
        element: <OrganizerPortalDashboardPage />,
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
        path: 'discover',
        element: <CustomerDiscoveryPage />,
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
        element: <Navigate to="/booking/seats" replace />,
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
        path: 'request-refund',
        element: <RequestRefundPage />,
      },
      {
        path: 'notifications',
        element: <NotificationsPage />,
      },
      {
        path: 'ai-faq',
        element: <AIFaqPage />,
      },
      {
        path: 'organizer-request',
        element: <OrganizerRequestPage />,
      },
      {
        path: 'organizer',
        element: <OrganizerDashboardPage />,
      },
      {
        path: 'organizer/events',
        element: <OrganizerEventListPage />,
      },
      {
        path: 'organizer/events/create',
        element: <CreateEventWizardPage />,
      },
      {
        path: 'organizer/orders',
        element: <OrderListPage />,
      },
      {
        path: 'organizer/attendees',
        element: <AttendeeListPage />,
      },
      {
        path: 'organizer/revenue',
        element: <RevenueDashboardPage />,
      },
      {
        path: 'staff',
        element: <StaffDashboardPage />,
      },
      {
        path: 'staff/qr-check-in',
        element: <QrCheckInPage />,
      },
      {
        path: 'staff/on-site-booking',
        element: <OnSiteBookingPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <RouterProvider router={router} />
    </GoogleOAuthProvider>
  )
}

export default App
