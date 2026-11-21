import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api, type RecoveryTokenInfo } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useI18n } from '../../i18n';
import {
  IconLock,
  IconShieldKeyhole,
  IconCheck,
  IconAlert,
  IconEye,
  IconEyeOff,
  IconArrowBack,
} from '../../components/icons';

export default function RecoveryVerify() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const { t, lang } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<RecoveryTokenInfo | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(
        lang === 'ar'
          ? 'رابط الاستعادة مفقود أو غير صحيح'
          : 'Recovery token is missing or invalid',
      );
      setLoading(false);
      return;
    }

    api.recovery
      .checkToken(token)
      .then((res) => {
        setTokenInfo(res.data);
      })
      .catch((err: any) => {
        setError(
          err.message ||
            (lang === 'ar'
              ? 'رابط استعادة الحساب غير صالح أو انتهت صلاحيته (30 دقيقة).'
              : 'Recovery link is invalid or expired (30 min limit).'),
        );
      })
      .finally(() => setLoading(false));
  }, [token, lang]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 8) {
      toast.push(
        'info',
        lang === 'ar'
          ? 'يجب ألا تقل كلمة المرور عن 8 أحرف وأرقام'
          : 'Password must be at least 8 characters',
      );
      return;
    }
    if (password !== confirmPassword) {
      toast.push(
        'info',
        lang === 'ar'
          ? 'كلمتا المرور غير متطابقتين'
          : 'Passwords do not match',
      );
      return;
    }

    setSubmitting(true);
    try {
      await api.recovery.complete({ token, password });
      setCompleted(true);
      toast.push(
        'success',
        lang === 'ar'
          ? 'تم استعادة حسابك وتعيين كلمة المرور بنجاح!'
          : 'Account recovered and password updated successfully!',
      );
    } catch (err: any) {
      toast.push(
        'error',
        err.message ||
          (lang === 'ar'
            ? 'فشل إكمال استعادة الحساب'
            : 'Failed to complete recovery'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-lg bg-surface border border-line rounded-2xl shadow-xl overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-primary-900 to-slate-900 p-6 text-center text-white border-b-2 border-gold-500">
          <div className="inline-flex size-14 rounded-2xl bg-gold-500/20 text-gold-400 items-center justify-center mb-3">
            <IconShieldKeyhole className="size-8" />
          </div>
          <h1 className="text-xl font-bold">
            {lang === 'ar'
              ? 'استعادة الحساب عبر البريد البديل'
              : 'Account Recovery via Alternative Email'}
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            {lang === 'ar'
              ? 'أكاديمية سراج التعليمية — التحقق الأمني المعتمد'
              : 'Siraj Academy — Verified Account Recovery'}
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {loading ? (
            <div className="py-12 text-center text-ink-secondary">
              <div className="inline-block size-8 border-3 border-gold-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm">
                {lang === 'ar'
                  ? 'جاري التحقق من رمز الاستعادة المعتمد...'
                  : 'Verifying recovery token...'}
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-6">
              <div className="inline-flex size-12 rounded-full bg-rose-500/10 text-rose-500 items-center justify-center mb-4">
                <IconAlert className="size-6" />
              </div>
              <h2 className="text-lg font-bold text-ink-primary mb-2">
                {lang === 'ar' ? 'تعذر استعادة الحساب' : 'Recovery Link Error'}
              </h2>
              <p className="text-sm text-ink-secondary mb-6 leading-relaxed">
                {error}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/login"
                  className="px-5 py-2.5 rounded-xl bg-elevated border border-line text-ink-primary hover:bg-elevated/80 text-sm font-semibold transition"
                >
                  {lang === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to Login'}
                </Link>
                <Link
                  to="/about"
                  className="px-5 py-2.5 rounded-xl bg-gold-500 text-slate-950 font-semibold hover:bg-gold-400 text-sm transition"
                >
                  {lang === 'ar' ? 'مراسلة الدعم الفني' : 'Contact Support'}
                </Link>
              </div>
            </div>
          ) : completed ? (
            <div className="text-center py-6">
              <div className="inline-flex size-14 rounded-full bg-emerald-500/20 text-emerald-500 items-center justify-center mb-4">
                <IconCheck className="size-8" />
              </div>
              <h2 className="text-xl font-bold text-ink-primary mb-2">
                {lang === 'ar'
                  ? 'تمت استعادة حسابك بنجاح!'
                  : 'Account Recovery Completed!'}
              </h2>
              <p className="text-sm text-ink-secondary mb-4 leading-relaxed">
                {lang === 'ar'
                  ? 'تم تحديث بريدك الإلكتروني المعتمد وتعيين كلمة المرور الجديدة. تم إنهاء الجلسات السابقة لأمان حسابك.'
                  : 'Your email address has been updated and new password set. Previous active sessions have been revoked.'}
              </p>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-6 text-xs text-emerald-700 dark:text-emerald-300">
                {lang === 'ar'
                  ? 'البريد الإلكتروني المعتمد الجديد: '
                  : 'New registered email: '}
                <strong>{tokenInfo?.maskedAlternativeEmail}</strong>
              </div>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full py-3 px-6 rounded-xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold transition shadow-md"
              >
                {lang === 'ar' ? 'تسجيل الدخول الآن' : 'Log In Now'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Token Info Card */}
              <div className="bg-elevated/70 border border-line rounded-xl p-4 text-xs space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-line/60">
                  <span className="text-ink-muted">
                    {lang === 'ar' ? 'رقم طلب الاستعادة:' : 'Recovery Ref:'}
                  </span>
                  <span className="font-mono font-bold text-gold-500">
                    {tokenInfo?.recoveryNo}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">
                    {lang === 'ar' ? 'صاحب الحساب:' : 'Account Owner:'}
                  </span>
                  <span className="font-semibold text-ink-primary">
                    {tokenInfo?.userFullName} (@{tokenInfo?.username})
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">
                    {lang === 'ar' ? 'البريد الأصلي السابق:' : 'Former Email:'}
                  </span>
                  <span className="font-mono text-ink-secondary">
                    {tokenInfo?.maskedOriginalEmail}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">
                    {lang === 'ar' ? 'البريد البديل الجديد:' : 'New Alternative Email:'}
                  </span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {tokenInfo?.maskedAlternativeEmail}
                  </span>
                </div>
              </div>

              <div className="text-xs text-ink-muted">
                {lang === 'ar'
                  ? 'يرجى إدخال كلمة مرور قوية جديدة لاستكمال استعادة الحساب وتثبيت البريد البديل.'
                  : 'Please establish a strong new password to complete recovery.'}
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-xs font-semibold text-ink-primary mb-1.5">
                  {lang === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-xl bg-surface border border-line text-ink-primary text-sm focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 ltr:right-3 rtl:left-3 flex items-center text-ink-muted hover:text-ink-primary"
                  >
                    {showPassword ? (
                      <IconEyeOff className="size-4" />
                    ) : (
                      <IconEye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div>
                <label className="block text-xs font-semibold text-ink-primary mb-1.5">
                  {lang === 'ar'
                    ? 'تأكيد كلمة المرور الجديدة'
                    : 'Confirm New Password'}
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface border border-line text-ink-primary text-sm focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-6 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-slate-950 font-bold text-sm transition shadow-md flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="size-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>
                      {lang === 'ar'
                        ? 'جاري إكمال الاستعادة...'
                        : 'Completing Recovery...'}
                    </span>
                  </>
                ) : (
                  <>
                    <IconLock className="size-4" />
                    <span>
                      {lang === 'ar'
                        ? 'تأكيد الاستعادة وتعيين كلمة المرور'
                        : 'Confirm Recovery & Set Password'}
                    </span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
