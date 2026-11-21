import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/api';
import { Spinner } from './ui';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

export function RoleRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (user.role !== role) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : user.role === 'TEACHER' ? '/teacher' : '/dashboard'} replace />;
  }
  return <>{children}</>;
}

/**
 * حارس صفحات الزوار فقط (Guest Only):
 * يمنع المستخدم المسجل من رؤية صفحات تسجيل الدخول أو إنشاء الحساب،
 * ويقوم بتحويله فوراً إلى لوحة التحكم الخاصة بدوره (طالب / معلّم / إدارة).
 */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (user) {
    const from = (loc.state as { from?: string } | null)?.from;
    const defaultTarget =
      user.role === 'ADMIN' ? '/admin' : user.role === 'TEACHER' ? '/teacher' : '/dashboard';
    const dest = from && !from.startsWith('/login') && !from.startsWith('/register') ? from : defaultTarget;
    return <Navigate to={dest} replace />;
  }
  return <>{children}</>;
}
