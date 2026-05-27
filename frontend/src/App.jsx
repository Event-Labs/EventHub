import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout.jsx'
import { BookingPage } from '@/pages/BookingPage.jsx'
import {
  BookingAttendeesPage,
  BookingPaymentPage,
  BookingReviewPage,
  BookingSeatsPage,
} from '@/pages/BookingFlowPages.jsx'
import { CustomerDiscoveryPage } from '@/pages/CustomerDiscoveryPage.jsx'
import { EventDetailPage } from '@/pages/EventDetailPage.jsx'
import { EventsPage } from '@/pages/EventsPage.jsx'
import { FavoriteEventsPage } from '@/pages/FavoriteEventsPage.jsx'
import { HomePage } from '@/pages/HomePage.jsx'
import { LoginPage } from '@/pages/LoginPage.jsx'
import { MyTicketsPage } from '@/pages/MyTicketsPage.jsx'
import { NotFoundPage } from '@/pages/NotFoundPage.jsx'
import { PaymentConfirmationPage } from '@/pages/PaymentConfirmationPage.jsx'
import {
  AccountListPage,
  AdminDashboardPage,
  AIFaqPage,
  AttendeeListPage,
  CreateEventWizardPage,
  EventReviewPage,
  ForgotPasswordPage,
  NotificationsPage,
  OnSiteBookingPage,
  OrderListPage,
  OrganizerDashboardPage,
  OrganizerEventListPage,
  OrganizerRequestPage,
  PlatformFeePage,
  QrCheckInPage,
  RequestRefundPage,
  RevenueDashboardPage,
  StaffDashboardPage,
} from '@/pages/PlatformPages.jsx'
import { ProfilePage } from '@/pages/ProfilePage.jsx'
import { RegisterPage } from '@/pages/RegisterPage.jsx'
import { TicketDetailPage } from '@/pages/TicketDetailPage.jsx'

const router = createBrowserRouter([
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
        element: <BookingPage />,
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
        path: 'favorites',
        element: <FavoriteEventsPage />,
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
        path: 'admin',
        element: <AdminDashboardPage />,
      },
      {
        path: 'admin/accounts',
        element: <AccountListPage />,
      },
      {
        path: 'admin/event-review',
        element: <EventReviewPage />,
      },
      {
        path: 'admin/platform-fee',
        element: <PlatformFeePage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
