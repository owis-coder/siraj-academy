import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { I18nProvider } from './i18n';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { ThemeProvider } from './lib/theme';
import { PublicLayout, StudentLayout, TeacherLayout, AdminLayout } from './components/layouts';
import { ProtectedRoute, RoleRoute, GuestRoute } from './components/guards';

import Home from './pages/public/Home';
import Universities from './pages/public/Universities';
import UniversityProfile from './pages/public/UniversityProfile';
import Courses from './pages/public/Courses';
import CourseDetail from './pages/public/CourseDetail';
import Services from './pages/public/Services';
import ServiceDetail from './pages/public/ServiceDetail';
import Requests from './pages/public/Requests';
import RequestDetail from './pages/public/RequestDetail';
import RequestNew from './pages/public/RequestNew';
import CustomRequestNew from './pages/public/CustomRequestNew';
import Teachers from './pages/public/Teachers';
import TeacherProfilePage from './pages/public/TeacherProfilePage';
import Login from './pages/public/Login';
import Register from './pages/public/Register';
import RegisterChoice from './pages/public/RegisterChoice';
import RegisterComplete from './pages/public/RegisterComplete';
import VerifyEmail from './pages/public/VerifyEmail';
import ForgotPassword from './pages/public/ForgotPassword';
import ResetPassword from './pages/public/ResetPassword';
import ConfirmEmailChange from './pages/public/ConfirmEmailChange';
import AccountProfile from './pages/account/Profile';
import AccountSettings from './pages/account/Settings';
import AdminAudit from './pages/dashboard/admin/AdminAudit';
import AdminSecurity from './pages/dashboard/admin/AdminSecurity';
import About from './pages/public/About';
import Faq from './pages/public/Faq';
import PrivacyPolicy from './pages/public/PrivacyPolicy';
import TermsOfUse from './pages/public/TermsOfUse';
import RefundPolicy from './pages/public/RefundPolicy';
import NotFound from './pages/NotFound';

import { DashboardHome, Orders, OrderDetail } from './pages/dashboard/student/StudentPages';
import { MyCourses, MyRequests, StudentCustomRequests, ChatPage, Notifications, Favorites, Profile } from './pages/dashboard/student/StudentOther';

import { TeacherHome, TeacherOfferings, TeacherRequests, TeacherLive, TeacherEarnings, TeacherProfileDash } from './pages/dashboard/teacher/TeacherPages';

import {
  AdminHome,
  AdminCrud,
  AdminColleges,
  AdminMajors,
  AdminCourses,
  AdminOfferings,
  AdminTeachers,
  AdminRequests,
  AdminCustomRequests,
  AdminPayments,
  AdminOrders,
  AdminAds,
  AdminSettings,
  AdminBroadcast,
  type CrudConfig,
} from './pages/dashboard/admin/AdminPages';

const UNIS_CFG: CrudConfig = {
  resource: 'universities',
  title: 'ad.uni',
  subtitle: 'ad.uniSub',
  fields: [
    { key: 'name', label: 'ad.uniName', required: true, placeholder: 'مثال: جامعة الملك سعود' },
    { key: 'slug', label: 'ad.slug', hint: 'ad.slugHint', placeholder: 'اختياري - يتم توليده تلقائياً' },
    { key: 'city', label: 'ad.city', placeholder: 'مثال: الرياض' },
    { key: 'logoUrl', label: 'ad.logoUrl', placeholder: 'رابط الشعار أو مسار الصورة' },
    { key: 'order', label: 'ad.displayOrder', type: 'number', placeholder: '0' },
    { key: 'isVisible', label: 'ad.visibleToStudents', type: 'checkbox' },
  ],
};

const SERVICES_CFG: CrudConfig = {
  resource: 'services',
  title: 'ad.service',
  subtitle: 'ad.serviceSub',
  fields: [
    { key: 'title', label: 'ad.serviceName', required: true, placeholder: 'مثال: كتابة تكاليف ومشاريع جاهزة' },
    { key: 'slug', label: 'ad.slugShort', hint: 'ad.slugHint', placeholder: 'اختياري - يتم توليده تلقائياً' },
    {
      key: 'category', label: 'ad.category', type: 'select', required: true, options: [
        { value: 'PRIVATE_EXPLAIN', label: 'status.category.PRIVATE_EXPLAIN' },
        { value: 'LIVE_EXPLAIN', label: 'status.category.LIVE_EXPLAIN' },
        { value: 'SUMMARY', label: 'status.category.SUMMARY' },
        { value: 'TRANSLATION', label: 'status.category.TRANSLATION' },
        { value: 'PPT', label: 'status.category.PPT' },
        { value: 'PROGRAMMING_PROJECT', label: 'status.category.PROGRAMMING_PROJECT' },
        { value: 'RESEARCH_REVIEW', label: 'status.category.RESEARCH_REVIEW' },
        { value: 'PROOFREADING', label: 'status.category.PROOFREADING' },
        { value: 'ACADEMIC_FORMAT', label: 'status.category.ACADEMIC_FORMAT' },
        { value: 'HOMEWORK_TRAINING', label: 'status.category.HOMEWORK_TRAINING' },
        { value: 'ACADEMIC_CONSULT', label: 'status.category.ACADEMIC_CONSULT' },
        { value: 'CUSTOM', label: 'status.category.CUSTOM' },
      ],
    },
    { key: 'description', label: 'ad.description', type: 'textarea', required: true, placeholder: 'اكتب وصفاً للخدمة وما تشمله...' },
    { key: 'basePrice', label: 'ad.basePrice', type: 'number', placeholder: 'مثال: 100' },
    { key: 'durationDays', label: 'ad.durationDays', type: 'number', placeholder: 'مثال: 3' },
    { key: 'isActive', label: 'ad.activeField', type: 'checkbox' },
    { key: 'isFeatured', label: 'ad.featured', type: 'checkbox' },
  ],
};

export default function App() {
  return (
    <I18nProvider>
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Analytics />
            <Routes>
            {/* ============ عام ============ */}
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="universities" element={<Universities />} />
              <Route path="universities/:slug" element={<UniversityProfile />} />
              <Route path="courses" element={<Courses />} />
              <Route path="courses/:id" element={<CourseDetail />} />
              <Route path="services" element={<Services />} />
              <Route path="services/:slug" element={<ServiceDetail />} />
              <Route path="requests" element={<Requests />} />
              <Route path="requests/new" element={<RequestNew />} />
              <Route path="requests/custom" element={<CustomRequestNew />} />
              <Route path="requests/:id" element={<RequestDetail />} />
              <Route path="teachers" element={<Teachers />} />
              <Route path="teachers/:username" element={<TeacherProfilePage />} />
              <Route path="login" element={<GuestRoute><Login /></GuestRoute>} />
              <Route path="register" element={<GuestRoute><RegisterChoice /></GuestRoute>} />
              <Route path="register/form" element={<GuestRoute><Register /></GuestRoute>} />
              <Route path="register/email" element={<GuestRoute><Register /></GuestRoute>} />
              <Route path="register/complete" element={<GuestRoute><RegisterComplete /></GuestRoute>} />
              <Route path="verify-email" element={<VerifyEmail />} />
              <Route path="forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
              <Route path="reset-password" element={<GuestRoute><ResetPassword /></GuestRoute>} />
              <Route path="confirm-email-change" element={<ConfirmEmailChange />} />

              {/* ===== الحساب مدمج في الموقع (طالب/مدرّس/إدارة) ===== */}
              <Route
                path="account/profile"
                element={
                  <ProtectedRoute>
                    <AccountProfile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="account/settings"
                element={
                  <ProtectedRoute>
                    <AccountSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="account/notifications"
                element={
                  <ProtectedRoute>
                    <div className="container-x py-10">
                      <Notifications />
                    </div>
                  </ProtectedRoute>
                }
              />
              <Route path="about" element={<About />} />
              <Route path="faq" element={<Faq />} />
              <Route path="privacy" element={<PrivacyPolicy />} />
              <Route path="terms" element={<TermsOfUse />} />
              <Route path="refund" element={<RefundPolicy />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* ============ لوحة الطالب ============ */}
            <Route
              path="dashboard"
              element={
                <RoleRoute role="STUDENT">
                  <StudentLayout />
                </RoleRoute>
              }
            >
              <Route index element={<DashboardHome />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="courses" element={<MyCourses />} />
              <Route path="requests" element={<MyRequests />} />
              <Route path="custom-requests" element={<StudentCustomRequests />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="favorites" element={<Favorites />} />
              <Route path="profile" element={<Profile />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>

            {/* ============ لوحة المدرّس ============ */}
            <Route
              path="teacher"
              element={
                <RoleRoute role="TEACHER">
                  <TeacherLayout />
                </RoleRoute>
              }
            >
              <Route index element={<TeacherHome />} />
              <Route path="offerings" element={<TeacherOfferings />} />
              <Route path="requests" element={<TeacherRequests />} />
              <Route path="ads" element={<Navigate to="/teacher" replace />} />
              <Route path="live" element={<TeacherLive />} />
              <Route path="earnings" element={<TeacherEarnings />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="profile" element={<TeacherProfileDash />} />
              <Route path="*" element={<Navigate to="/teacher" replace />} />
            </Route>

            {/* ============ لوحة الإدارة ============ */}
            <Route
              path="admin"
              element={
                <RoleRoute role="ADMIN">
                  <AdminLayout />
                </RoleRoute>
              }
            >
              <Route index element={<AdminHome />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="universities" element={<AdminCrud cfg={UNIS_CFG} />} />
              <Route path="colleges" element={<AdminColleges />} />
              <Route path="majors" element={<AdminMajors />} />
              <Route path="services" element={<AdminCrud cfg={SERVICES_CFG} />} />
              <Route path="courses" element={<AdminCourses />} />
              <Route path="offerings" element={<AdminOfferings />} />
              <Route path="teachers" element={<AdminTeachers />} />
              <Route path="requests" element={<AdminRequests />} />
              <Route path="custom-requests" element={<AdminCustomRequests />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="ads" element={<AdminAds />} />
              <Route path="notifications" element={<AdminBroadcast />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="security" element={<AdminSecurity />} />
              <Route path="audit" element={<AdminAudit />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>      </AuthProvider>
    </ThemeProvider>
    </I18nProvider>
  );
}
