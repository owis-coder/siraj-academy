import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  api,
  type AdminUserListItem,
  type AdminUserDetail,
  type AdminRecoveryItem,
  type UserManagementStats,
} from '../../../lib/api';
import { useToast } from '../../../lib/toast';
import { useI18n } from '../../../i18n';
import { useAuth } from '../../../lib/auth';
import {
  IconUser,
  IconSearch,
  IconRefresh,
  IconShieldKeyhole,
  IconLock,
  IconEdit,
  IconCheck,
  IconAlert,
  IconClose,
  IconInfo,
  IconKey,
  IconAudit,
  IconProhibited,
  IconTeachers,
  IconGraduation,
  IconSecurity,
  IconArrowBack,
  IconArrowForward,
  IconWhatsapp,
} from '../../../components/icons';

export default function AdminUserManagement() {
  const toast = useToast();
  const { t, lang } = useI18n();
  const { user: currentAdmin } = useAuth();

  // Active Main Tab: 'users' | 'recoveries'
  const [mainTab, setMainTab] = useState<'users' | 'recoveries'>('users');

  // Stats
  const [stats, setStats] = useState<UserManagementStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Users Directory State
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  // Global Recovery Requests State
  const [recoveries, setRecoveries] = useState<AdminRecoveryItem[]>([]);
  const [loadingRecoveries, setLoadingRecoveries] = useState(false);
  const [recoveryStatusFilter, setRecoveryStatusFilter] = useState<string>('');
  const [recoveryPage, setRecoveryPage] = useState(1);
  const [recoveryTotalPages, setRecoveryTotalPages] = useState(1);

  // User Detail Modal State
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailSection, setDetailSection] = useState<'general' | 'security' | 'password_recovery' | 'alt_recovery' | 'audit'>('general');
  const [copiedId, setCopiedId] = useState(false);

  // Alternative Recovery Wizard Step (1: Info, 2: New Email, 3: Verification, 4: Review)
  const [altStep, setAltStep] = useState<1 | 2 | 3 | 4>(1);

  // Profile Edit Form States
  const [editFullName, setEditFullName] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editLevel, setEditLevel] = useState('');
  const [editBio, setEditBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Username Change
  const [newUsername, setNewUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  // Email Direct Change
  const [newDirectEmail, setNewDirectEmail] = useState('');
  const [directEmailReason, setDirectEmailReason] = useState('');
  const [savingDirectEmail, setSavingDirectEmail] = useState(false);
  const [showDirectEmailForm, setShowDirectEmailForm] = useState(false);

  // Role Change
  const [newRole, setNewRole] = useState<string>('');
  const [roleConfirmed, setRoleConfirmed] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  // Suspend Dialog
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);

  // Password Recovery Confirmation Dialog
  const [showPasswordRecoveryConfirm, setShowPasswordRecoveryConfirm] = useState(false);
  const [sendingRecoveryEmail, setSendingRecoveryEmail] = useState(false);

  // Alternative Recovery Form
  const [altEmail, setAltEmail] = useState('');
  const [altReason, setAltReason] = useState('');
  const [altVerificationMethod, setAltVerificationMethod] = useState<string>('NATIONAL_ID');
  const [altNotes, setAltNotes] = useState('');
  const [altEvidenceRef, setAltEvidenceRef] = useState('');
  const [submittingAltRecovery, setSubmittingAltRecovery] = useState(false);

  // Review Modal State (Dual-Admin Approval)
  const [reviewRecoveryItem, setReviewRecoveryItem] = useState<AdminRecoveryItem | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Lock background scroll when modal is active
  useEffect(() => {
    if (activeUserId || showSuspendModal || reviewRecoveryItem || showPasswordRecoveryConfirm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeUserId, showSuspendModal, reviewRecoveryItem, showPasswordRecoveryConfirm]);

  // Copy User ID
  const copyUserId = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    toast.push('info', lang === 'ar' ? 'تم نسخ معرّف الحساب' : 'User ID copied');
    setTimeout(() => setCopiedId(false), 2000);
  }, [lang, toast]);

  // Fetch Stats
  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const res = await api.admin.users.stats().catch(() => null);
      if (res && res.data) {
        setStats(res.data);
      }
    } catch (err: any) {
      console.warn('Failed to load user management stats', err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Fetch Users
  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await api.admin.users.list({
        q: searchQuery,
        role: selectedRole || undefined,
        status: selectedStatus || undefined,
        filter: selectedFilter,
        page,
        limit: 15,
      });
      const rawData = res?.data as any;
      const rawList: any[] = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.items)
        ? rawData.items
        : [];

      const safeItems: AdminUserListItem[] = rawList.map((u: any) => ({
        id: u?.id || '',
        fullName: u?.fullName || u?.username || 'مستخدم',
        username: u?.username || '',
        email: u?.email || '',
        role: u?.role || 'STUDENT',
        status: u?.status || 'ACTIVE',
        emailVerified: !!u?.emailVerified,
        emailVerifiedAt: u?.emailVerifiedAt || null,
        whatsapp: u?.whatsapp || null,
        level: u?.level || null,
        avatarUrl: u?.avatarUrl || null,
        createdAt: u?.createdAt || new Date().toISOString(),
        updatedAt: u?.updatedAt || new Date().toISOString(),
        activeSessionsCount: u?.activeSessionsCount ?? u?._count?.sessions ?? 0,
        recoveryRequestsCount: u?.recoveryRequestsCount ?? u?._count?.targetRecoveries ?? 0,
        teacherProfile: u?.teacherProfile || null,
      }));

      setUsers(safeItems);
      const totalP = rawData?.totalPages ?? res?.meta?.totalPages ?? 1;
      setTotalPages(Math.max(1, totalP));
    } catch (err: any) {
      console.error('loadUsers error:', err);
      toast.push('error', err.message || 'فشل تحميل قائمة المستخدمين');
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch Recoveries
  const loadRecoveries = async () => {
    try {
      setLoadingRecoveries(true);
      const res = await api.admin.users.recoveries({
        status: recoveryStatusFilter || undefined,
        page: recoveryPage,
        limit: 15,
      }).catch(() => null);

      const rawData = res?.data as any;
      const rawList: any[] = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.items)
        ? rawData.items
        : [];
      setRecoveries(rawList);
      const totalP = rawData?.totalPages ?? res?.meta?.totalPages ?? 1;
      setRecoveryTotalPages(Math.max(1, totalP));
    } catch (err: any) {
      console.error('loadRecoveries error:', err);
      setRecoveries([]);
    } finally {
      setLoadingRecoveries(false);
    }
  };

  // Dynamic Stats Fallback
  const displayStats = useMemo(() => {
    if (stats) return stats;
    const safeList = users || [];
    return {
      totalUsers: safeList.length,
      studentsCount: safeList.filter((u) => u.role === 'STUDENT').length,
      teachersCount: safeList.filter((u) => u.role === 'TEACHER').length,
      adminsCount: safeList.filter((u) => u.role === 'ADMIN').length,
      activeCount: safeList.filter((u) => u.status === 'ACTIVE').length,
      suspendedCount: safeList.filter((u) => u.status === 'SUSPENDED').length,
      unverifiedCount: safeList.filter((u) => !u.emailVerified).length,
      pendingRecoveriesCount: safeList.filter((u) => (u.recoveryRequestsCount ?? 0) > 0).length,
    };
  }, [stats, users]);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (mainTab === 'users') {
      loadUsers();
    } else {
      loadRecoveries();
    }
  }, [mainTab, page, selectedRole, selectedStatus, selectedFilter, recoveryPage, recoveryStatusFilter]);

  // Handle Search Submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadUsers();
  };

  // Load User Detail
  const openUserDetail = async (id: string) => {
    setActiveUserId(id);
    setDetailSection('general');
    setAltStep(1);
    setShowDirectEmailForm(false);
    try {
      setLoadingDetail(true);
      const res = await api.admin.users.get(id);
      const user = res.data.user;
      setUserDetail(user);
      setEditFullName(user.fullName || '');
      setEditWhatsapp(user.whatsapp || '');
      setEditLevel(user.level || '');
      setEditBio(user.teacherProfile?.bio || '');
      setNewUsername(user.username || '');
      setNewDirectEmail('');
      setDirectEmailReason('');
      setNewRole(user.role);
      setRoleConfirmed(false);
      setAltEmail('');
      setAltReason('');
      setAltNotes('');
      setAltEvidenceRef('');
    } catch (err: any) {
      toast.push('error', err.message || 'فشل تحميل تفاصيل المستخدم');
      setActiveUserId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId) return;
    setSavingProfile(true);
    try {
      await api.admin.users.updateProfile(activeUserId, {
        fullName: editFullName,
        whatsapp: editWhatsapp,
        level: editLevel,
        bio: editBio,
      });
      toast.push('success', lang === 'ar' ? 'تم تحديث الملف الشخصي بنجاح' : 'Profile updated successfully');
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل تحديث الملف الشخصي' : 'Failed to update profile'));
    } finally {
      setSavingProfile(false);
    }
  };

  // Save Username
  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId) return;
    setSavingUsername(true);
    try {
      await api.admin.users.changeUsername(activeUserId, { username: newUsername });
      toast.push('success', lang === 'ar' ? 'تم تغيير اسم المستخدم بنجاح' : 'Username changed successfully');
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل تغيير اسم المستخدم' : 'Failed to change username'));
    } finally {
      setSavingUsername(false);
    }
  };

  // Save Direct Email
  const handleSaveDirectEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId) return;
    if (!newDirectEmail || !directEmailReason) {
      toast.push('info', lang === 'ar' ? 'يرجى كتابة البريد الجديد والسبب الإداري' : 'Email and reason required');
      return;
    }
    setSavingDirectEmail(true);
    try {
      await api.admin.users.changeEmail(activeUserId, {
        email: newDirectEmail,
        reason: directEmailReason,
      });
      toast.push('success', lang === 'ar' ? 'تم تعديل البريد الإلكتروني بنجاح وتسجيل العملية' : 'Email updated and logged');
      setNewDirectEmail('');
      setDirectEmailReason('');
      setShowDirectEmailForm(false);
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل تعديل البريد الإلكتروني' : 'Failed to change email'));
    } finally {
      setSavingDirectEmail(false);
    }
  };

  // Save Role
  const handleSaveRole = async () => {
    if (!activeUserId) return;
    if (!roleConfirmed) {
      toast.push('info', lang === 'ar' ? 'يرجى تأكيد الرغبة في تغيير دور المستخدم' : 'Please confirm role change');
      return;
    }
    setSavingRole(true);
    try {
      await api.admin.users.changeRole(activeUserId, { role: newRole, confirm: true });
      toast.push('success', lang === 'ar' ? `تم تغيير دور الحساب بنجاح إلى ${newRole}` : `Role changed to ${newRole}`);
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل تغيير دور الحساب' : 'Failed to change role'));
    } finally {
      setSavingRole(false);
    }
  };

  // Suspend User
  const handleSuspend = async () => {
    if (!activeUserId || !suspendReason) {
      toast.push('info', lang === 'ar' ? 'يرجى توضيح سبب تعليق الحساب' : 'Suspension reason required');
      return;
    }
    setSuspending(true);
    try {
      await api.admin.users.suspend(activeUserId, { reason: suspendReason });
      toast.push('success', lang === 'ar' ? 'تم تعليق الحساب وإنهاء جلساته بنجاح' : 'Account suspended successfully');
      setShowSuspendModal(false);
      setSuspendReason('');
      openUserDetail(activeUserId);
      loadUsers();
      loadStats();
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل تعليق الحساب' : 'Failed to suspend account'));
    } finally {
      setSuspending(false);
    }
  };

  // Reactivate User
  const handleReactivate = async () => {
    if (!activeUserId) return;
    try {
      await api.admin.users.reactivate(activeUserId);
      toast.push('success', lang === 'ar' ? 'تمت إعادة تفعيل الحساب بنجاح' : 'Account reactivated successfully');
      openUserDetail(activeUserId);
      loadUsers();
      loadStats();
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل تفعيل الحساب' : 'Failed to reactivate account'));
    }
  };

  // Revoke All Sessions
  const handleRevokeSessions = async () => {
    if (!activeUserId) return;
    try {
      await api.admin.users.revokeSessions(activeUserId);
      toast.push('success', lang === 'ar' ? 'تم إسقاط كافة الجلسات النشطة للمستخدم' : 'All active sessions revoked');
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل إلغاء الجلسات' : 'Failed to revoke sessions'));
    }
  };

  // Send Recovery Email
  const handleSendRecoveryEmail = async () => {
    if (!activeUserId) return;
    setSendingRecoveryEmail(true);
    try {
      const res = await api.admin.users.sendRecoveryEmail(activeUserId);
      toast.push('success', res.data?.message || (lang === 'ar' ? 'تم إرسال رابط استعادة كلمة المرور بنجاح' : 'Recovery email sent successfully'));
      setShowPasswordRecoveryConfirm(false);
      openUserDetail(activeUserId);
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل إرسال رابط استعادة كلمة المرور' : 'Failed to send recovery email'));
    } finally {
      setSendingRecoveryEmail(false);
    }
  };

  // Submit Alternative Recovery Request
  const handleSubmitAltRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId) return;
    if (!altEmail || !altReason) {
      toast.push('info', lang === 'ar' ? 'يرجى إدخال البريد البديل وسبب الفقدان' : 'New email and reason required');
      return;
    }
    setSubmittingAltRecovery(true);
    try {
      const res = await api.admin.users.createAlternativeRecovery(activeUserId, {
        alternativeEmail: altEmail,
        reason: altReason,
        verificationMethod: altVerificationMethod,
        verificationNotes: altNotes,
        evidenceRef: altEvidenceRef,
      });
      toast.push('success', res.data?.message || (lang === 'ar' ? 'تم تسجيل طلب الاستعادة بنجاح' : 'Recovery request created'));
      setAltEmail('');
      setAltReason('');
      setAltNotes('');
      setAltEvidenceRef('');
      setAltStep(1);
      openUserDetail(activeUserId);
      loadStats();
      loadRecoveries();
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل إنشاء طلب استعادة الحساب' : 'Failed to create recovery request'));
    } finally {
      setSubmittingAltRecovery(false);
    }
  };

  // Submit Review (Dual-Admin Approval)
  const handleSubmitReview = async () => {
    if (!reviewRecoveryItem) return;
    setSubmittingReview(true);
    try {
      const res = await api.admin.users.reviewRecovery(reviewRecoveryItem.id, {
        decision: reviewDecision,
        notes: reviewNotes,
      });
      toast.push('success', res.data?.message || (lang === 'ar' ? 'تم اعتماد مراجعة الطلب بنجاح' : 'Review submitted successfully'));
      setReviewRecoveryItem(null);
      setReviewNotes('');
      loadRecoveries();
      loadStats();
      if (activeUserId) openUserDetail(activeUserId);
    } catch (err: any) {
      toast.push('error', err.message || (lang === 'ar' ? 'فشل اعتماد مراجعة الطلب' : 'Failed to submit review'));
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Title & Main Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface border border-line rounded-2xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-10 rounded-xl bg-gold-500/10 border border-gold-500/20 text-gold-500 flex items-center justify-center">
              <IconUser className="size-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-ink-primary">
                {lang === 'ar' ? 'إدارة حسابات المستخدمين واستعادتها' : 'User Account Management & Recovery'}
              </h1>
              <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
                {lang === 'ar'
                  ? 'إدارة متكاملة لحسابات الطلاب والمدرسين، التحكم بالصلاحيات، ومسارات الاستعادة الآمنة'
                  : 'Comprehensive administration for students, teachers, permissions, and security recovery'}
              </p>
            </div>
          </div>
        </div>

        {/* Main Tab Segmented Control */}
        <div className="inline-flex rounded-xl bg-elevated/60 border border-line p-1 shadow-inner self-start md:self-center">
          <button
            type="button"
            onClick={() => setMainTab('users')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              mainTab === 'users'
                ? 'bg-surface text-gold-500 shadow-sm border border-line/60'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <IconUser className="size-3.5" />
            <span>{lang === 'ar' ? 'دليل المستخدمين' : 'User Directory'}</span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab('recoveries')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 relative ${
              mainTab === 'recoveries'
                ? 'bg-surface text-gold-500 shadow-sm border border-line/60'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <IconShieldKeyhole className="size-3.5" />
            <span>{lang === 'ar' ? 'طلبات الاستعادة' : 'Recovery Requests'}</span>
            {displayStats.pendingRecoveriesCount > 0 && (
              <span className="ms-1 px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-extrabold animate-pulse">
                {displayStats.pendingRecoveriesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* KPI Stats Counter Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-surface border border-line rounded-xl p-3.5 shadow-sm hover:border-gold-500/30 transition">
          <div className="text-[11px] font-medium text-ink-muted">{lang === 'ar' ? 'إجمالي المستخدمين' : 'Total Users'}</div>
          <div className="text-xl font-bold text-ink-primary mt-1">{displayStats.totalUsers}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3.5 shadow-sm hover:border-sky-500/30 transition">
          <div className="text-[11px] font-medium text-ink-muted">{lang === 'ar' ? 'الطلاب' : 'Students'}</div>
          <div className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1">{displayStats.studentsCount}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3.5 shadow-sm hover:border-emerald-500/30 transition">
          <div className="text-[11px] font-medium text-ink-muted">{lang === 'ar' ? 'المدرسون' : 'Teachers'}</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{displayStats.teachersCount}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3.5 shadow-sm hover:border-emerald-500/30 transition">
          <div className="text-[11px] font-medium text-ink-muted">{lang === 'ar' ? 'حسابات نشطة' : 'Active'}</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{displayStats.activeCount}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3.5 shadow-sm hover:border-rose-500/30 transition">
          <div className="text-[11px] font-medium text-ink-muted">{lang === 'ar' ? 'حسابات معلقة' : 'Suspended'}</div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">{displayStats.suspendedCount}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3.5 shadow-sm hover:border-amber-500/30 transition">
          <div className="text-[11px] font-medium text-ink-muted">{lang === 'ar' ? 'بريد غير موثق' : 'Unverified Email'}</div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{displayStats.unverifiedCount}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3.5 shadow-sm hover:border-rose-500/30 transition">
          <div className="text-[11px] font-medium text-ink-muted">{lang === 'ar' ? 'بانتظار الاعتماد' : 'Pending Approval'}</div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">{displayStats.pendingRecoveriesCount}</div>
        </div>
      </div>

      {/* Main Tab 1: User Directory */}
      {mainTab === 'users' && (
        <div className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
          {/* Filters & Search Toolbar */}
          <div className="p-4 border-b border-line flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-elevated/20">
            {/* Search Input */}
            <form onSubmit={handleSearch} className="flex-1 max-w-md relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'بحث بالاسم، اسم المستخدم، البريد أو المعرف...'
                    : 'Search name, username, email, ID...'
                }
                className="w-full ltr:pl-9 rtl:pr-9 ltr:pr-4 rtl:pl-4 h-10 rounded-xl bg-surface border border-line text-xs sm:text-sm text-ink-primary focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 outline-none transition"
              />
              <span className="absolute inset-y-0 ltr:left-3 rtl:right-3 flex items-center text-ink-muted pointer-events-none">
                <IconSearch className="size-4" />
              </span>
            </form>

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedFilter}
                onChange={(e) => {
                  setSelectedFilter(e.target.value);
                  setPage(1);
                }}
                className="h-10 px-3 rounded-xl bg-surface border border-line text-xs font-medium text-ink-primary outline-none focus:border-gold-500 transition"
              >
                <option value="all">{lang === 'ar' ? 'كافة الحسابات' : 'All Accounts'}</option>
                <option value="students">{lang === 'ar' ? 'الطلاب فقط' : 'Students Only'}</option>
                <option value="teachers">{lang === 'ar' ? 'المدرسون فقط' : 'Teachers Only'}</option>
                <option value="active">{lang === 'ar' ? 'الحسابات النشطة' : 'Active Accounts'}</option>
                <option value="suspended">{lang === 'ar' ? 'الحسابات المعلقة' : 'Suspended Accounts'}</option>
                <option value="unverified">{lang === 'ar' ? 'بريد إلكتروني غير موثق' : 'Unverified Email'}</option>
                <option value="recovery_required">{lang === 'ar' ? 'تتطلب استعادة' : 'Recovery In Progress'}</option>
                <option value="recent_modified">{lang === 'ar' ? 'عُدلت حديثاً (7 أيام)' : 'Recently Modified'}</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedFilter('all');
                  setSelectedRole('');
                  setSelectedStatus('');
                  setPage(1);
                  loadUsers();
                }}
                className="h-10 px-3 rounded-xl bg-surface border border-line text-ink-secondary hover:text-ink-primary hover:bg-elevated transition flex items-center gap-1.5 text-xs font-semibold"
                title={lang === 'ar' ? 'إعادة ضبط' : 'Reset'}
              >
                <IconRefresh className="size-4" />
                <span className="hidden sm:inline">{lang === 'ar' ? 'إعادة ضبط' : 'Reset'}</span>
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-elevated/50 text-ink-muted border-b border-line uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'المستخدم' : 'User'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'الدور' : 'Role'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'الجلسات' : 'Sessions'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'تاريخ التسجيل' : 'Registered'}</th>
                  <th className="py-3.5 px-4 text-center">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-ink-secondary">
                      <div className="inline-block size-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin mb-2" />
                      <div>{lang === 'ar' ? 'جاري تحميل المستخدمين...' : 'Loading users...'}</div>
                    </td>
                  </tr>
                ) : (users || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-ink-secondary">
                      {lang === 'ar' ? 'لا توجد حسابات مطابقة لمعايير البحث' : 'No users match criteria'}
                    </td>
                  </tr>
                ) : (
                  (users || []).map((u) => (
                    <tr key={u.id} className="hover:bg-elevated/40 transition">
                      {/* Name & Username */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-gold-500/10 text-gold-500 font-bold flex items-center justify-center text-sm border border-gold-500/20 shrink-0">
                            {u.fullName.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-semibold text-ink-primary flex items-center gap-1.5">
                              <span>{u.fullName}</span>
                              {u.recoveryRequestsCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                                  {lang === 'ar' ? 'استعادة نشطة' : 'Recovery'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-ink-muted">@{u.username}</div>
                          </div>
                        </div>
                      </td>

                      {/* Email & Verification */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-secondary">{u.email}</span>
                          {u.emailVerified ? (
                            <span title={lang === 'ar' ? 'بريد موثق' : 'Verified'} className="text-emerald-500">
                              <IconCheck className="size-3.5" />
                            </span>
                          ) : (
                            <span
                              title={lang === 'ar' ? 'بريد غير موثق' : 'Unverified'}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-600 font-semibold"
                            >
                              !
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                              : u.role === 'TEACHER'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                              : 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                          }`}
                        >
                          {u.role === 'ADMIN'
                            ? lang === 'ar' ? 'مدير نظام' : 'Admin'
                            : u.role === 'TEACHER'
                            ? lang === 'ar' ? 'مدرس' : 'Teacher'
                            : lang === 'ar' ? 'طالب' : 'Student'}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                            u.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold border border-rose-500/30'
                          }`}
                        >
                          {u.status === 'ACTIVE'
                            ? lang === 'ar' ? 'نشط' : 'Active'
                            : lang === 'ar' ? 'معلق' : 'Suspended'}
                        </span>
                      </td>

                      {/* Active Sessions */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-elevated border border-line text-ink-secondary text-[11px]">
                          {u.activeSessionsCount} {lang === 'ar' ? 'جلسة' : 'sessions'}
                        </span>
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-4 text-ink-muted">
                        {new Date(u.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => openUserDetail(u.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-gold-500/15 hover:bg-gold-500/25 text-gold-400 font-semibold text-xs transition border border-gold-500/30 flex items-center gap-1.5 mx-auto"
                        >
                          <IconEdit className="size-3.5" />
                          <span>{lang === 'ar' ? 'إدارة الحساب' : 'Manage'}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-line flex items-center justify-between text-xs text-ink-secondary bg-elevated/20">
            <div>
              {lang === 'ar'
                ? `صفحة ${page} من ${totalPages}`
                : `Page ${page} of ${totalPages}`}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-surface border border-line disabled:opacity-40 hover:bg-elevated transition"
              >
                {lang === 'ar' ? 'السابق' : 'Previous'}
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-surface border border-line disabled:opacity-40 hover:bg-elevated transition"
              >
                {lang === 'ar' ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab 2: All Recovery Requests */}
      {mainTab === 'recoveries' && (
        <div className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-3 bg-elevated/20">
            <div>
              <h2 className="text-sm font-bold text-ink-primary">
                {lang === 'ar' ? 'سجل كافة طلبات استعادة الحسابات بالبريد البديل' : 'Account Alternative Recovery Log'}
              </h2>
              <p className="text-[11px] text-ink-muted mt-0.5">
                {lang === 'ar'
                  ? 'مراجعة وتتبع واعتماد طلبات تغيير البريد للحسابات التي فقد أصحابها وصولهم للبريد الأصلي'
                  : 'Track and review sensitive alternative email recovery requests requiring verification'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={recoveryStatusFilter}
                onChange={(e) => {
                  setRecoveryStatusFilter(e.target.value);
                  setRecoveryPage(1);
                }}
                className="h-9 px-3 rounded-xl bg-surface border border-line text-xs font-medium text-ink-primary outline-none focus:border-gold-500"
              >
                <option value="">{lang === 'ar' ? 'كافة الحالات' : 'All Statuses'}</option>
                <option value="PENDING_APPROVAL">{lang === 'ar' ? 'بانتظار الاعتماد المزدوج' : 'Pending Approval'}</option>
                <option value="VERIFICATION_SENT">{lang === 'ar' ? 'أُرسل رابط التحقق' : 'Verification Sent'}</option>
                <option value="COMPLETED">{lang === 'ar' ? 'مكتمل بنجاح' : 'Completed'}</option>
                <option value="REJECTED">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</option>
                <option value="CANCELLED">{lang === 'ar' ? 'ملغي' : 'Cancelled'}</option>
              </select>
              <button
                type="button"
                onClick={loadRecoveries}
                className="h-9 p-2 rounded-xl bg-surface border border-line text-ink-secondary hover:text-ink-primary transition"
                title={lang === 'ar' ? 'تحديث' : 'Refresh'}
              >
                <IconRefresh className="size-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-elevated/50 text-ink-muted border-b border-line uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'رقم الطلب' : 'Recovery No'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'صاحب الحساب' : 'Account Owner'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'البريد البديل الجديد' : 'New Alternative Email'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'طريقة التحقق' : 'Verification'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'مستوى الخطورة' : 'Risk'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'المشرف المنشئ' : 'Initiator'}</th>
                  <th className="py-3.5 px-4 text-center">{lang === 'ar' ? 'الإجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {loadingRecoveries ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-ink-secondary">
                      <div className="inline-block size-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin mb-2" />
                      <div>{lang === 'ar' ? 'جاري تحميل طلبات الاستعادة...' : 'Loading recovery requests...'}</div>
                    </td>
                  </tr>
                ) : (recoveries || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-ink-secondary">
                      {lang === 'ar' ? 'لا توجد طلبات استعادة مطابقة' : 'No recovery requests found'}
                    </td>
                  </tr>
                ) : (
                  (recoveries || []).map((r) => (
                    <tr key={r.id} className="hover:bg-elevated/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-gold-500">{r.recoveryNo}</td>
                      <td className="py-3.5 px-4 font-medium text-ink-primary">
                        {r.user?.fullName || 'User'} (@{r.user?.username || '—'})
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {r.alternativeEmail}
                      </td>
                      <td className="py-3.5 px-4 text-ink-secondary">
                        <div>{r.verificationMethod}</div>
                        {r.evidenceRef && <div className="text-[10px] text-ink-muted">Ref: {r.evidenceRef}</div>}
                      </td>
                      <td className="py-3.5 px-4">
                        {r.isHighRisk ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20">
                            {lang === 'ar' ? 'عالي الخطورة (اعتماد مزدوج)' : 'High Risk'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-500/10 text-ink-muted">
                            {lang === 'ar' ? 'عادي' : 'Normal'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.status === 'COMPLETED'
                              ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                              : r.status === 'PENDING_APPROVAL'
                              ? 'bg-amber-500/15 text-amber-600 border border-amber-500/20 animate-pulse'
                              : r.status === 'VERIFICATION_SENT'
                              ? 'bg-sky-500/15 text-sky-600 border border-sky-500/20'
                              : 'bg-rose-500/15 text-rose-600 border border-rose-500/20'
                          }`}
                        >
                          {r.status === 'COMPLETED'
                            ? lang === 'ar' ? 'مكتمل' : 'Completed'
                            : r.status === 'PENDING_APPROVAL'
                            ? lang === 'ar' ? 'بانتظار الاعتماد' : 'Pending Approval'
                            : r.status === 'VERIFICATION_SENT'
                            ? lang === 'ar' ? 'أُرسل الرابط' : 'Link Sent'
                            : lang === 'ar' ? 'مرفوض/ملغي' : r.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-ink-muted">{r.initiator?.fullName || 'Admin'}</td>
                      <td className="py-3.5 px-4 text-center">
                        {r.status === 'PENDING_APPROVAL' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewRecoveryItem(r);
                              setReviewDecision('APPROVED');
                              setReviewNotes('');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold text-xs transition shadow-sm"
                          >
                            {lang === 'ar' ? 'مراجعة واعتماد' : 'Review & Approve'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openUserDetail(r.userId)}
                            className="px-2.5 py-1 rounded-lg bg-elevated border border-line text-ink-secondary hover:text-ink-primary text-xs"
                          >
                            {lang === 'ar' ? 'عرض الحساب' : 'View User'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* REDESIGNED ACCOUNT DETAILS WORKSPACE (LARGE CENTERED DIALOG) */}
      {/* ============================================================ */}
      {activeUserId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 md:p-6 animate-in fade-in duration-200">
          <div className="w-full sm:max-w-5xl md:max-w-6xl h-full sm:h-[90vh] sm:max-h-[92vh] bg-surface sm:border border-line sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Stable Header */}
            <div className="px-5 py-4 border-b border-line bg-elevated/40 shrink-0 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="size-12 rounded-2xl bg-gold-500/10 border border-gold-500/20 text-gold-500 font-bold flex items-center justify-center text-lg shrink-0">
                  {userDetail?.fullName.slice(0, 1) || 'U'}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-ink-primary truncate">
                      {userDetail?.fullName || (lang === 'ar' ? 'تحميل...' : 'Loading...')}
                    </h2>
                    <span className="text-xs text-ink-muted font-medium">@{userDetail?.username}</span>

                    {/* Role Badge */}
                    {userDetail && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                          userDetail.role === 'ADMIN'
                            ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                            : userDetail.role === 'TEACHER'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        {userDetail.role}
                      </span>
                    )}

                    {/* Status Badge */}
                    {userDetail && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                          userDetail.status === 'ACTIVE'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {userDetail.status}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted mt-1 font-mono">
                    <span className="truncate">{userDetail?.email}</span>
                    <span className="opacity-40">•</span>
                    <button
                      type="button"
                      onClick={() => userDetail && copyUserId(userDetail.id)}
                      className="inline-flex items-center gap-1 hover:text-gold-500 transition cursor-pointer"
                      title={lang === 'ar' ? 'انقر للنسخ' : 'Click to copy'}
                    >
                      <span>ID: {userDetail?.id?.slice(0, 10)}...</span>
                      {copiedId ? (
                        <IconCheck className="size-3 text-emerald-500" />
                      ) : (
                        <span className="text-[10px] underline opacity-70">{lang === 'ar' ? 'نسخ' : 'copy'}</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setActiveUserId(null)}
                className="size-9 rounded-xl border border-line bg-surface hover:bg-elevated flex items-center justify-center text-ink-secondary hover:text-ink-primary transition shrink-0"
                title={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                <IconClose className="size-5" />
              </button>
            </div>

            {/* High-Risk Account Warning Banner (Subtle and Structured) */}
            {userDetail?.risk.isHighRisk && (
              <div className="bg-rose-500/10 border-b border-rose-500/20 px-5 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <IconAlert className="size-4 shrink-0 text-rose-500" />
                  <span className="font-bold">
                    {lang === 'ar' ? 'حساب عالي الخطورة:' : 'High Risk Account:'}
                  </span>
                  <span className="text-[11px] opacity-90 truncate max-w-xl">
                    {userDetail.risk.reasons.join(' • ')}
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-300 shrink-0">
                  {lang === 'ar' ? 'يتطلب اعتمادًا مزدوجًا' : 'Dual-Admin Required'}
                </span>
              </div>
            )}

            {/* Main Modal Layout: 2 Columns on Desktop, Segmented on Mobile */}
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              
              {/* Structured Navigation Sidebar */}
              <div className="w-full md:w-64 border-b md:border-b-0 md:border-e border-line bg-elevated/20 p-2 sm:p-3 shrink-0 flex md:flex-col overflow-x-auto md:overflow-y-auto gap-1">
                <button
                  type="button"
                  onClick={() => setDetailSection('general')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition flex items-center gap-2.5 shrink-0 text-start w-full ${
                    detailSection === 'general'
                      ? 'bg-gold-500/15 text-gold-500 font-bold border border-gold-500/30'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated/50'
                  }`}
                >
                  <IconUser className="size-4 shrink-0" />
                  <span>{lang === 'ar' ? 'المعلومات والملف' : 'General & Profile'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailSection('security')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition flex items-center gap-2.5 shrink-0 text-start w-full ${
                    detailSection === 'security'
                      ? 'bg-gold-500/15 text-gold-500 font-bold border border-gold-500/30'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated/50'
                  }`}
                >
                  <IconSecurity className="size-4 shrink-0" />
                  <span>{lang === 'ar' ? 'الأمان والجلسات' : 'Security & Sessions'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailSection('password_recovery')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition flex items-center gap-2.5 shrink-0 text-start w-full ${
                    detailSection === 'password_recovery'
                      ? 'bg-gold-500/15 text-gold-500 font-bold border border-gold-500/30'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated/50'
                  }`}
                >
                  <IconKey className="size-4 shrink-0" />
                  <span>{lang === 'ar' ? 'استعادة كلمة المرور' : 'Password Recovery'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailSection('alt_recovery')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition flex items-center gap-2.5 shrink-0 text-start w-full ${
                    detailSection === 'alt_recovery'
                      ? 'bg-gold-500/15 text-gold-500 font-bold border border-gold-500/30'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated/50'
                  }`}
                >
                  <IconShieldKeyhole className="size-4 shrink-0" />
                  <span>{lang === 'ar' ? 'استعادة بالبريد البديل' : 'Alternative Email'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailSection('audit')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition flex items-center gap-2.5 shrink-0 text-start w-full ${
                    detailSection === 'audit'
                      ? 'bg-gold-500/15 text-gold-500 font-bold border border-gold-500/30'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated/50'
                  }`}
                >
                  <IconAudit className="size-4 shrink-0" />
                  <span>{lang === 'ar' ? 'سجل التدقيق والنشاط' : 'Audit History'}</span>
                </button>
              </div>

              {/* Main Content Workspace */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
                {loadingDetail ? (
                  <div className="py-24 text-center text-ink-secondary">
                    <div className="inline-block size-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm font-medium">{lang === 'ar' ? 'جاري تحميل تفاصيل الحساب...' : 'Loading account details...'}</p>
                  </div>
                ) : userDetail ? (
                  <>
                    {/* SECTION 1: GENERAL INFORMATION */}
                    {detailSection === 'general' && (
                      <div className="space-y-6">
                        
                        {/* 1.1 Personal Information Card */}
                        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center justify-between border-b border-line pb-3">
                            <div className="flex items-center gap-2">
                              <IconUser className="size-4 text-gold-500" />
                              <h3 className="text-sm font-bold text-ink-primary">
                                {lang === 'ar' ? 'البيانات الشخصية والملف' : 'Personal & Profile Information'}
                              </h3>
                            </div>
                            <span className="text-[11px] text-ink-muted">
                              {lang === 'ar' ? 'تاريخ الإنشاء: ' : 'Created: '}
                              {new Date(userDetail.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                            </span>
                          </div>

                          <form onSubmit={handleSaveProfile} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                              <div>
                                <label className="block text-ink-muted font-medium mb-1.5">
                                  {lang === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                                </label>
                                <input
                                  type="text"
                                  value={editFullName}
                                  onChange={(e) => setEditFullName(e.target.value)}
                                  className="w-full h-10 px-3.5 rounded-xl bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 focus:ring-1 focus:ring-gold-500/20 outline-none transition"
                                />
                              </div>

                              <div>
                                <label className="block text-ink-muted font-medium mb-1.5">
                                  {lang === 'ar' ? 'رقم الواتساب' : 'WhatsApp'}
                                </label>
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={editWhatsapp}
                                    onChange={(e) => setEditWhatsapp(e.target.value)}
                                    placeholder="+9665xxxxxxxx"
                                    className="w-full h-10 ltr:pl-9 rtl:pr-9 ltr:pr-3 rtl:pl-3 rounded-xl bg-surface border border-line text-ink-primary text-xs font-mono focus:border-gold-500 focus:ring-1 focus:ring-gold-500/20 outline-none transition"
                                  />
                                  <span className="absolute inset-y-0 ltr:left-3 rtl:right-3 flex items-center text-ink-muted pointer-events-none">
                                    <IconWhatsapp className="size-4 text-emerald-500" />
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                              <div>
                                <label className="block text-ink-muted font-medium mb-1.5">
                                  {lang === 'ar' ? 'المستوى الدراسي' : 'Academic Level'}
                                </label>
                                <input
                                  type="text"
                                  value={editLevel}
                                  onChange={(e) => setEditLevel(e.target.value)}
                                  placeholder={lang === 'ar' ? 'مثال: السنة الثالثة' : 'e.g. Year 3'}
                                  className="w-full h-10 px-3.5 rounded-xl bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 focus:ring-1 focus:ring-gold-500/20 outline-none transition"
                                />
                              </div>

                              <div>
                                <label className="block text-ink-muted font-medium mb-1.5">
                                  {lang === 'ar' ? 'الجامعة والتخصص' : 'University & Major'}
                                </label>
                                <div className="h-10 px-3.5 rounded-xl bg-elevated/40 border border-line text-ink-secondary text-xs flex items-center">
                                  {userDetail.university?.name || (lang === 'ar' ? 'غير محدد' : 'Not set')}
                                  {userDetail.major?.name ? ` — ${userDetail.major.name}` : ''}
                                </div>
                              </div>
                            </div>

                            {userDetail.teacherProfile && (
                              <div className="text-xs">
                                <label className="block text-ink-muted font-medium mb-1.5">
                                  {lang === 'ar' ? 'نبذة المدرس الأكاديمية' : 'Teacher Bio'}
                                </label>
                                <textarea
                                  rows={2}
                                  value={editBio}
                                  onChange={(e) => setEditBio(e.target.value)}
                                  className="w-full p-3 rounded-xl bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 focus:ring-1 focus:ring-gold-500/20 outline-none transition"
                                />
                              </div>
                            )}

                            <div className="flex justify-end pt-2">
                              <button
                                type="submit"
                                disabled={savingProfile}
                                className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition shadow-sm"
                              >
                                {savingProfile ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ تعديلات الملف' : 'Save Changes')}
                              </button>
                            </div>
                          </form>
                        </div>

                        {/* 1.2 Username Management Card */}
                        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center gap-2 border-b border-line pb-3">
                            <IconKey className="size-4 text-gold-500" />
                            <h3 className="text-sm font-bold text-ink-primary">
                              {lang === 'ar' ? 'اسم المستخدم (مع التحقق من الفرادة)' : 'Username Settings'}
                            </h3>
                          </div>

                          <form onSubmit={handleSaveUsername} className="space-y-3">
                            <p className="text-xs text-ink-muted">
                              {lang === 'ar'
                                ? 'يجب أن يتكون اسم المستخدم من 3 إلى 30 حرفًا أو رقمًا باللغة الإنجليزية ولا يحتوي مسافات.'
                                : 'Username must be 3-30 alphanumeric characters without spaces.'}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  value={newUsername}
                                  onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                  className="w-full h-10 ltr:pl-8 rtl:pr-8 ltr:pr-3 rtl:pl-3 rounded-xl bg-surface border border-line text-xs font-mono font-bold text-ink-primary focus:border-gold-500 focus:ring-1 focus:ring-gold-500/20 outline-none transition"
                                  placeholder="username"
                                />
                                <span className="absolute inset-y-0 ltr:left-3 rtl:right-3 flex items-center text-ink-muted font-mono">
                                  @
                                </span>
                              </div>
                              <button
                                type="submit"
                                disabled={savingUsername || newUsername === userDetail.username || !newUsername.trim()}
                                className="h-10 px-5 rounded-xl bg-elevated border border-line hover:bg-elevated/80 disabled:opacity-40 text-ink-primary font-bold text-xs transition shrink-0"
                              >
                                {savingUsername ? (lang === 'ar' ? 'جاري التحديث...' : 'Updating...') : (lang === 'ar' ? 'تحديث اسم المستخدم' : 'Update Username')}
                              </button>
                            </div>
                          </form>
                        </div>

                        {/* 1.3 Contact & Direct Email Update Card */}
                        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center justify-between border-b border-line pb-3">
                            <div className="flex items-center gap-2">
                              <IconAlert className="size-4 text-amber-500" />
                              <h3 className="text-sm font-bold text-ink-primary">
                                {lang === 'ar' ? 'البريد الإلكتروني المسجل والتوثيق' : 'Registered Email & Verification'}
                              </h3>
                            </div>
                            <div className="flex items-center gap-2">
                              {userDetail.emailVerified ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  <IconCheck className="size-3.5" />
                                  <span>{lang === 'ar' ? 'موثق' : 'Verified'}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  <IconAlert className="size-3.5" />
                                  <span>{lang === 'ar' ? 'غير موثق' : 'Unverified'}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-elevated/30 border border-line rounded-xl p-4">
                            <div>
                              <div className="text-[11px] text-ink-muted">{lang === 'ar' ? 'البريد الإلكتروني الحالي للحساب:' : 'Current Email:'}</div>
                              <div className="font-mono font-bold text-ink-primary text-sm mt-0.5">{userDetail.email}</div>
                              {userDetail.emailVerifiedAt && (
                                <div className="text-[10px] text-ink-muted mt-1">
                                  {lang === 'ar' ? 'وقت التوثيق: ' : 'Verified at: '}
                                  {new Date(userDetail.emailVerifiedAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowDirectEmailForm(!showDirectEmailForm)}
                              className="px-4 py-2 rounded-xl bg-surface border border-line text-xs font-bold text-ink-secondary hover:text-ink-primary hover:bg-elevated transition self-start sm:self-auto"
                            >
                              {showDirectEmailForm
                                ? (lang === 'ar' ? 'إلغاء التعديل' : 'Cancel')
                                : (lang === 'ar' ? 'تعديل البريد مباشرة (إداري)' : 'Change Email Directly')}
                            </button>
                          </div>

                          {showDirectEmailForm && (
                            <form onSubmit={handleSaveDirectEmail} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
                              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                                {lang === 'ar'
                                  ? 'تنبيه: التعديل المباشر يحدث البريد فوراً بدون انتظار تحقق، ويسقط كافة الجلسات النشطة للمستخدم ويسجل الحدث في سجل التدقيق الأمني.'
                                  : 'Notice: Direct change updates email immediately, revokes all sessions, and logs an audit trail.'}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                  <label className="block text-ink-muted mb-1 font-semibold">
                                    {lang === 'ar' ? 'البريد الإلكتروني الجديد *' : 'New Email *'}
                                  </label>
                                  <input
                                    type="email"
                                    required
                                    value={newDirectEmail}
                                    onChange={(e) => setNewDirectEmail(e.target.value)}
                                    placeholder="new.email@example.com"
                                    className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-ink-primary text-xs font-mono focus:border-gold-500 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-ink-muted mb-1 font-semibold">
                                    {lang === 'ar' ? 'السبب الإداري للتعديل *' : 'Administrative Reason *'}
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    value={directEmailReason}
                                    onChange={(e) => setDirectEmailReason(e.target.value)}
                                    placeholder={lang === 'ar' ? 'سبب التعديل المباشر...' : 'Reason...'}
                                    className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end pt-1">
                                <button
                                  type="submit"
                                  disabled={savingDirectEmail || !newDirectEmail || !directEmailReason}
                                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition"
                                >
                                  {savingDirectEmail ? (lang === 'ar' ? 'جاري التعديل...' : 'Updating...') : (lang === 'ar' ? 'تأكيد تعديل البريد' : 'Confirm Change')}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>

                        {/* 1.4 Role Management (Protected Action) */}
                        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center gap-2 border-b border-line pb-3">
                            <IconShieldKeyhole className="size-4 text-purple-500" />
                            <h3 className="text-sm font-bold text-ink-primary">
                              {lang === 'ar' ? 'تعديل دور الحساب (إجراء محمي)' : 'Role Management (Protected Operation)'}
                            </h3>
                          </div>

                          <div className="space-y-3">
                            <p className="text-xs text-ink-muted">
                              {lang === 'ar'
                                ? 'تغيير الدور بين (طالب / مدرس / مدير) يتطلب تأكيداً صريحاً ويقوم بإنهاء كافة الجلسات النشطة للمستخدم فوراً لتطبيق الصلاحيات الجديدة.'
                                : 'Role changes require explicit confirmation and invalidate all active sessions immediately.'}
                            </p>

                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                              <select
                                value={newRole}
                                onChange={(e) => setNewRole(e.target.value)}
                                disabled={userDetail.id === currentAdmin?.id}
                                className="h-10 px-3.5 rounded-xl bg-surface border border-line text-xs font-bold text-ink-primary outline-none focus:border-purple-500"
                              >
                                <option value="STUDENT">{lang === 'ar' ? 'طالب (STUDENT)' : 'Student (STUDENT)'}</option>
                                <option value="TEACHER">{lang === 'ar' ? 'مدرس (TEACHER)' : 'Teacher (TEACHER)'}</option>
                                <option value="ADMIN">{lang === 'ar' ? 'مدير نظام (ADMIN)' : 'Administrator (ADMIN)'}</option>
                              </select>

                              <label className="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={roleConfirmed}
                                  onChange={(e) => setRoleConfirmed(e.target.checked)}
                                  disabled={userDetail.id === currentAdmin?.id}
                                  className="rounded border-line"
                                />
                                <span>{lang === 'ar' ? 'أؤكد رغبتي بتغيير دور المستخدم وإسقاط الجلسات' : 'Confirm role modification'}</span>
                              </label>

                              <button
                                type="button"
                                onClick={handleSaveRole}
                                disabled={savingRole || !roleConfirmed || newRole === userDetail.role || userDetail.id === currentAdmin?.id}
                                className="h-10 px-5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs transition shrink-0"
                              >
                                {savingRole ? (lang === 'ar' ? 'جاري التطبيق...' : 'Applying...') : (lang === 'ar' ? 'تطبيق تغيير الدور' : 'Apply Role Change')}
                              </button>
                            </div>

                            {userDetail.id === currentAdmin?.id && (
                              <p className="text-xs text-rose-500 font-semibold">
                                {lang === 'ar'
                                  ? 'حماية أمنية: لا يمكن للمشرف تعديل صلاحيات أو دور حسابه الإداري الخاص.'
                                  : 'Security Protection: Administrators cannot modify their own role.'}
                              </p>
                            )}
                          </div>
                        </div>

                      </div>
                    )}

                    {/* SECTION 2: SECURITY & SESSIONS */}
                    {detailSection === 'security' && (
                      <div className="space-y-6">
                        
                        {/* 2.1 Security Actions Toolbar */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          
                          {/* Revoke Sessions Card */}
                          <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-3">
                            <div className="flex items-center gap-2">
                              <IconProhibited className="size-5 text-amber-500" />
                              <h4 className="text-sm font-bold text-ink-primary">
                                {lang === 'ar' ? 'إلغاء كافة الجلسات النشطة' : 'Revoke All Sessions'}
                              </h4>
                            </div>
                            <p className="text-xs text-ink-muted leading-relaxed">
                              {lang === 'ar'
                                ? 'يقوم هذا الإجراء برفع إصدار الجلسة وإسقاط كافة الرموز الحالية، وتسجيل الخروج الفوري من جميع الأجهزة والمتصفحات.'
                                : 'Increments sessionVersion, immediately terminating all active logins across devices.'}
                            </p>
                            <button
                              type="button"
                              onClick={handleRevokeSessions}
                              className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-xs transition flex items-center gap-2"
                            >
                              <IconProhibited className="size-4" />
                              <span>{lang === 'ar' ? 'إسقاط كافة الجلسات الآن' : 'Revoke All Sessions'}</span>
                            </button>
                          </div>

                          {/* Suspend / Reactivate Card */}
                          <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm space-y-3">
                            <div className="flex items-center gap-2">
                              <IconLock className="size-5 text-rose-500" />
                              <h4 className="text-sm font-bold text-ink-primary">
                                {lang === 'ar' ? 'حالة الحساب والحظر' : 'Account Status & Lock'}
                              </h4>
                            </div>
                            <p className="text-xs text-ink-muted leading-relaxed">
                              {userDetail.status === 'ACTIVE'
                                ? lang === 'ar'
                                  ? 'الحساب نشط حالياً. يمكنك تعليق الحساب مؤقتاً لأسباب أمنية أو مخالفة الشروط.'
                                  : 'Account is active. Suspending blocks logins and revokes sessions.'
                                : lang === 'ar'
                                  ? 'الحساب معلق حالياً. يمكنك استعادة تفعيله والسماح للمستخدم بالدخول مجدداً.'
                                  : 'Account is currently suspended. You can reactivate access.'}
                            </p>
                            <div>
                              {userDetail.status === 'ACTIVE' ? (
                                <button
                                  type="button"
                                  onClick={() => setShowSuspendModal(true)}
                                  disabled={userDetail.id === currentAdmin?.id}
                                  className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold text-xs transition flex items-center gap-2 disabled:opacity-40"
                                >
                                  <IconLock className="size-4" />
                                  <span>{lang === 'ar' ? 'تعليق الحساب مؤقتاً' : 'Suspend Account'}</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleReactivate}
                                  className="px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-xs transition flex items-center gap-2"
                                >
                                  <IconCheck className="size-4" />
                                  <span>{lang === 'ar' ? 'إعادة تفعيل الحساب' : 'Reactivate Account'}</span>
                                </button>
                              )}
                            </div>
                          </div>

                        </div>

                        {/* 2.2 Active Sessions List */}
                        <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
                          <div className="p-4 bg-elevated/40 border-b border-line flex items-center justify-between">
                            <h4 className="text-xs font-bold text-ink-primary flex items-center gap-2">
                              <IconSecurity className="size-4 text-gold-500" />
                              <span>{lang === 'ar' ? 'سجل الأجهزة والجلسات المسجلة' : 'Registered Devices & Sessions'}</span>
                            </h4>
                            <span className="text-[11px] font-mono text-ink-muted">
                              SessionVersion: {userDetail.sessionVersion}
                            </span>
                          </div>

                          <div className="divide-y divide-line/60 text-xs">
                            {userDetail.sessions.length === 0 ? (
                              <div className="p-8 text-center text-ink-muted">
                                {lang === 'ar' ? 'لا توجد جلسات مسجلة لهذا الحساب' : 'No recorded sessions'}
                              </div>
                            ) : (
                              userDetail.sessions.map((s) => (
                                <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-elevated/30 transition">
                                  <div>
                                    <div className="font-mono text-ink-primary font-bold text-xs flex items-center gap-2">
                                      <span>IP: {s.ip || '—'}</span>
                                    </div>
                                    <div className="text-[11px] text-ink-muted truncate max-w-lg mt-0.5">
                                      {s.userAgent || 'Unknown Device / Browser'}
                                    </div>
                                  </div>
                                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1">
                                    {s.endedAt ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-500/10 text-ink-muted font-medium">
                                        {lang === 'ar' ? 'مُنتهية' : 'Ended'} ({s.endReason || '—'})
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                                        {lang === 'ar' ? 'جلسة نشطة' : 'Active'}
                                      </span>
                                    )}
                                    <div className="text-[10px] text-ink-muted">
                                      {new Date(s.lastSeenAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                      </div>
                    )}

                    {/* SECTION 3: PASSWORD RECOVERY (ORIGINAL EMAIL) */}
                    {detailSection === 'password_recovery' && (
                      <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-5">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-xl bg-gold-500/10 border border-gold-500/20 text-gold-500 flex items-center justify-center">
                            <IconKey className="size-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-ink-primary">
                              {lang === 'ar' ? 'استعادة كلمة المرور عبر البريد المسجل الأصلي' : 'Original Email Password Recovery'}
                            </h3>
                            <p className="text-xs text-ink-muted mt-0.5">
                              {lang === 'ar'
                                ? 'إجراء رسمي لإرسال رابط إعادة تعيين كلمة المرور إلى البريد المسجل للحساب'
                                : 'Send a single-use secure reset link to the account’s registered email'}
                            </p>
                          </div>
                        </div>

                        <div className="bg-elevated/30 border border-line rounded-xl p-4 text-xs space-y-2">
                          <div className="text-ink-muted">{lang === 'ar' ? 'البريد الإلكتروني المستهدف للرسالة:' : 'Target Registered Email:'}</div>
                          <div className="text-base font-mono font-bold text-ink-primary">{userDetail.email}</div>
                          <div className="text-[11px] text-ink-secondary leading-relaxed pt-1">
                            {lang === 'ar'
                              ? '• يتم توليد رمز أمان عشوائي أحادي الاستخدام (Single-Use Token) مشفر بتجزئة SHA-256.'
                              : '• Cryptographically secure single-use token hashed with SHA-256.'}
                            <br />
                            {lang === 'ar'
                              ? '• صلاحية الرابط 30 دقيقة فقط، ويتم إبطال كافة الرموز السابقة فور الإرسال.'
                              : '• Link expires in 30 minutes; previous tokens are invalidated.'}
                            <br />
                            {lang === 'ar'
                              ? '• لن يتم إرسال أي كلمة مرور بنص واضح، ولن يطلع المشرف على الرمز أو كلمة المرور الجديدة.'
                              : '• No plaintext passwords are sent or exposed to administrators.'}
                          </div>
                        </div>

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setShowPasswordRecoveryConfirm(true)}
                            className="px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold text-xs transition shadow-md flex items-center gap-2"
                          >
                            <IconKey className="size-4" />
                            <span>{lang === 'ar' ? 'إرسال رابط الاستعادة إلى البريد الأصلي' : 'Send Recovery Link to Email'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SECTION 4: ALTERNATIVE EMAIL RECOVERY (WIZARD) */}
                    {detailSection === 'alt_recovery' && (
                      <div className="space-y-6">
                        
                        {/* Security Warning Box */}
                        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
                          <IconAlert className="size-5 text-amber-500 shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            <strong className="font-bold">
                              {lang === 'ar' ? 'مسار استعادة الحساب الحساس (فقدان البريد الأصلي):' : 'Sensitive Account Takeover Workflow:'}
                            </strong>
                            <p className="mt-1 text-[11px]">
                              {lang === 'ar'
                                ? 'هذا الإجراء مخصص حصراً للحالات التي فقد فيها المستخدم إمكانية الوصول لبريده القديم بشكل نهائي. يتطلب توثيقاً رسمياً للهوية، وتخضع الحسابات عالية الخطورة لاعتماد إلزامي من مشرف ثانٍ (Dual-Admin Approval) قبل إرسال رابط التفعيل.'
                                : 'For users who permanently lost their original email. Strict identity verification required. High-risk accounts require secondary admin approval.'}
                            </p>
                          </div>
                        </div>

                        {/* Step-Based Wizard Form */}
                        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
                          
                          {/* Stepper Navigation */}
                          <div className="grid grid-cols-4 gap-2 border-b border-line pb-4 text-xs">
                            <div className={`p-2 rounded-xl text-center font-bold transition ${altStep === 1 ? 'bg-gold-500/15 text-gold-500 border border-gold-500/30' : 'text-ink-muted'}`}>
                              1. {lang === 'ar' ? 'تأكيد الحساب' : 'Account'}
                            </div>
                            <div className={`p-2 rounded-xl text-center font-bold transition ${altStep === 2 ? 'bg-gold-500/15 text-gold-500 border border-gold-500/30' : 'text-ink-muted'}`}>
                              2. {lang === 'ar' ? 'البريد البديل' : 'New Email'}
                            </div>
                            <div className={`p-2 rounded-xl text-center font-bold transition ${altStep === 3 ? 'bg-gold-500/15 text-gold-500 border border-gold-500/30' : 'text-ink-muted'}`}>
                              3. {lang === 'ar' ? 'التحقق والسبب' : 'Verification'}
                            </div>
                            <div className={`p-2 rounded-xl text-center font-bold transition ${altStep === 4 ? 'bg-gold-500/15 text-gold-500 border border-gold-500/30' : 'text-ink-muted'}`}>
                              4. {lang === 'ar' ? 'المراجعة والإرسال' : 'Submit'}
                            </div>
                          </div>

                          {/* Wizard Step 1: Confirmation */}
                          {altStep === 1 && (
                            <div className="space-y-4 text-xs animate-in fade-in duration-150">
                              <h4 className="text-sm font-bold text-ink-primary">
                                {lang === 'ar' ? 'الخطوة 1: التحقق من الحساب المستهدف' : 'Step 1: Confirm Target Account'}
                              </h4>
                              <div className="bg-elevated/40 border border-line rounded-xl p-4 space-y-2">
                                <div className="flex justify-between">
                                  <span className="text-ink-muted">{lang === 'ar' ? 'اسم المستخدم:' : 'Username:'}</span>
                                  <span className="font-bold text-ink-primary">@{userDetail.username}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-ink-muted">{lang === 'ar' ? 'البريد القديم المسجل:' : 'Old Email:'}</span>
                                  <span className="font-mono text-ink-secondary">{userDetail.email}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-ink-muted">{lang === 'ar' ? 'تصنيف الخطورة:' : 'Risk Level:'}</span>
                                  <span className={userDetail.risk.isHighRisk ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
                                    {userDetail.risk.isHighRisk ? (lang === 'ar' ? 'عالي الخطورة (يتطلب اعتماد مزدوج)' : 'High Risk') : (lang === 'ar' ? 'عادي' : 'Normal')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-end pt-2">
                                <button
                                  type="button"
                                  onClick={() => setAltStep(2)}
                                  className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold text-xs transition flex items-center gap-2"
                                >
                                  <span>{lang === 'ar' ? 'المتابعة للبريد البديل' : 'Continue'}</span>
                                  <IconArrowForward className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Wizard Step 2: New Alternative Email */}
                          {altStep === 2 && (
                            <div className="space-y-4 text-xs animate-in fade-in duration-150">
                              <h4 className="text-sm font-bold text-ink-primary">
                                {lang === 'ar' ? 'الخطوة 2: إدخال البريد الإلكتروني البديل الجديد' : 'Step 2: Enter New Alternative Email'}
                              </h4>
                              <div>
                                <label className="block text-ink-muted font-semibold mb-1.5">
                                  {lang === 'ar' ? 'البريد الإلكتروني البديل الجديد *' : 'New Alternative Email *'}
                                </label>
                                <input
                                  type="email"
                                  required
                                  value={altEmail}
                                  onChange={(e) => setAltEmail(e.target.value)}
                                  placeholder="new.alternative@example.com"
                                  className="w-full h-10 px-3.5 rounded-xl bg-surface border border-line text-ink-primary text-xs font-mono focus:border-gold-500 outline-none"
                                />
                                <p className="text-[11px] text-ink-muted mt-1.5">
                                  {lang === 'ar'
                                    ? 'سيتم إرسال رابط تأكيد وتعيين كلمة المرور إلى هذا العنوان فقط بعد اعتماد الطلب.'
                                    : 'A secure verification link will be sent to this address once approved.'}
                                </p>
                              </div>

                              <div className="flex justify-between pt-2">
                                <button
                                  type="button"
                                  onClick={() => setAltStep(1)}
                                  className="px-4 py-2 rounded-xl bg-elevated border border-line text-xs font-semibold hover:bg-elevated/80 transition"
                                >
                                  {lang === 'ar' ? 'رجوع' : 'Back'}
                                </button>
                                <button
                                  type="button"
                                  disabled={!altEmail || !altEmail.includes('@')}
                                  onClick={() => setAltStep(3)}
                                  className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition flex items-center gap-2"
                                >
                                  <span>{lang === 'ar' ? 'المتابعة لبيانات التحقق' : 'Continue'}</span>
                                  <IconArrowForward className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Wizard Step 3: Identity Verification & Reason */}
                          {altStep === 3 && (
                            <div className="space-y-4 text-xs animate-in fade-in duration-150">
                              <h4 className="text-sm font-bold text-ink-primary">
                                {lang === 'ar' ? 'الخطوة 3: توثيق الهوية وسبب الفقدان' : 'Step 3: Verification Method & Reason'}
                              </h4>

                              <div>
                                <label className="block text-ink-muted font-semibold mb-1">
                                  {lang === 'ar' ? 'سبب فقدان الوصول للبريد الأصلي *' : 'Reason for Lost Email Access *'}
                                </label>
                                <textarea
                                  required
                                  rows={2}
                                  value={altReason}
                                  onChange={(e) => setAltReason(e.target.value)}
                                  placeholder={lang === 'ar' ? 'مثال: تعطل نطاق الجامعة السابق / اختراق الحساب القديم...' : 'Reason for loss'}
                                  className="w-full p-3 rounded-xl bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-ink-muted font-semibold mb-1">
                                    {lang === 'ar' ? 'طريقة التحقق من الهوية *' : 'Verification Method *'}
                                  </label>
                                  <select
                                    value={altVerificationMethod}
                                    onChange={(e) => setAltVerificationMethod(e.target.value)}
                                    className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                                  >
                                    <option value="NATIONAL_ID">بطاقة الهوية الوطنية / الإقامة (National ID)</option>
                                    <option value="PASSPORT">جواز السفر (Passport)</option>
                                    <option value="STUDENT_ID">البطاقة الجامعية (Student ID)</option>
                                    <option value="ACADEMIC_RECORD">السجل الأكاديمي (Academic Record)</option>
                                    <option value="OFFICIAL_PHONE_CALL">مكالمة هاتفية موثقة (Phone Verification)</option>
                                    <option value="VIDEO_VERIFICATION">تحقق مرئي (Video Call)</option>
                                    <option value="OTHER">طريقة أخرى موثقة (Other)</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-ink-muted font-semibold mb-1">
                                    {lang === 'ar' ? 'الرقم المرجعي للإثبات / التذكرة' : 'Evidence Ref / Ticket ID'}
                                  </label>
                                  <input
                                    type="text"
                                    value={altEvidenceRef}
                                    onChange={(e) => setAltEvidenceRef(e.target.value)}
                                    placeholder="TICK-10294"
                                    className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-ink-primary text-xs font-mono focus:border-gold-500 outline-none"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-ink-muted font-semibold mb-1">
                                  {lang === 'ar' ? 'ملاحظات التحقق الإدارية' : 'Verification Notes'}
                                </label>
                                <input
                                  type="text"
                                  value={altNotes}
                                  onChange={(e) => setAltNotes(e.target.value)}
                                  placeholder={lang === 'ar' ? 'تمت مطابقة رقم الجوال المسجل والسجل الأكاديمي بنجاح' : 'Notes'}
                                  className="w-full h-10 px-3 rounded-xl bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                                />
                              </div>

                              <div className="flex justify-between pt-2">
                                <button
                                  type="button"
                                  onClick={() => setAltStep(2)}
                                  className="px-4 py-2 rounded-xl bg-elevated border border-line text-xs font-semibold hover:bg-elevated/80 transition"
                                >
                                  {lang === 'ar' ? 'رجوع' : 'Back'}
                                </button>
                                <button
                                  type="button"
                                  disabled={!altReason.trim()}
                                  onClick={() => setAltStep(4)}
                                  className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition flex items-center gap-2"
                                >
                                  <span>{lang === 'ar' ? 'المتابعة للمراجعة النهائية' : 'Review & Submit'}</span>
                                  <IconArrowForward className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Wizard Step 4: Review & Final Submission */}
                          {altStep === 4 && (
                            <form onSubmit={handleSubmitAltRecovery} className="space-y-4 text-xs animate-in fade-in duration-150">
                              <h4 className="text-sm font-bold text-ink-primary">
                                {lang === 'ar' ? 'الخطوة 4: تأكيد ومراجعة طلب الاستعادة' : 'Step 4: Confirm and Submit Recovery Request'}
                              </h4>

                              <div className="bg-elevated/40 border border-line rounded-xl p-4 space-y-2.5">
                                <div className="flex justify-between">
                                  <span className="text-ink-muted">{lang === 'ar' ? 'صاحب الحساب:' : 'Account Owner:'}</span>
                                  <span className="font-bold text-ink-primary">{userDetail.fullName} (@{userDetail.username})</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-ink-muted">{lang === 'ar' ? 'البريد البديل الجديد:' : 'New Alternative Email:'}</span>
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{altEmail}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-ink-muted">{lang === 'ar' ? 'سبب الفقدان:' : 'Reason:'}</span>
                                  <span className="text-ink-primary">{altReason}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-ink-muted">{lang === 'ar' ? 'طريقة التحقق:' : 'Method:'}</span>
                                  <span className="text-ink-primary">{altVerificationMethod}</span>
                                </div>
                                {altEvidenceRef && (
                                  <div className="flex justify-between">
                                    <span className="text-ink-muted">{lang === 'ar' ? 'مرجع الإثبات:' : 'Evidence Ref:'}</span>
                                    <span className="font-mono text-ink-primary">{altEvidenceRef}</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex justify-between pt-2">
                                <button
                                  type="button"
                                  onClick={() => setAltStep(3)}
                                  className="px-4 py-2 rounded-xl bg-elevated border border-line text-xs font-semibold hover:bg-elevated/80 transition"
                                >
                                  {lang === 'ar' ? 'رجوع للتعديل' : 'Back'}
                                </button>
                                <button
                                  type="submit"
                                  disabled={submittingAltRecovery}
                                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-md flex items-center gap-2"
                                >
                                  <IconShieldKeyhole className="size-4" />
                                  <span>{submittingAltRecovery ? (lang === 'ar' ? 'جاري المعالجة...' : 'Processing...') : (lang === 'ar' ? 'تأكيد وإرسال طلب الاستعادة' : 'Submit Recovery Request')}</span>
                                </button>
                              </div>
                            </form>
                          )}

                        </div>

                        {/* User's Previous Recovery Requests Table */}
                        <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
                          <div className="p-4 bg-elevated/40 border-b border-line">
                            <h4 className="text-xs font-bold text-ink-primary">
                              {lang === 'ar' ? 'سجل طلبات استعادة هذا الحساب' : 'Recovery History for This Account'}
                            </h4>
                          </div>
                          <div className="divide-y divide-line/60 text-xs">
                            {userDetail.recoveries.length === 0 ? (
                              <div className="p-8 text-center text-ink-muted">
                                {lang === 'ar' ? 'لا توجد طلبات استعادة سابقة لهذا الحساب' : 'No previous recovery requests'}
                              </div>
                            ) : (
                              userDetail.recoveries.map((rec) => (
                                <div key={rec.id} className="p-4 space-y-2 hover:bg-elevated/30 transition">
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono font-bold text-gold-500">{rec.recoveryNo}</span>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        rec.status === 'COMPLETED'
                                          ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                                          : rec.status === 'PENDING_APPROVAL'
                                          ? 'bg-amber-500/15 text-amber-600 border border-amber-500/20'
                                          : 'bg-slate-500/10 text-ink-muted'
                                      }`}
                                    >
                                      {rec.status}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-ink-secondary">
                                    {lang === 'ar' ? 'البريد البديل: ' : 'Alternative Email: '}
                                    <span className="font-mono font-bold text-ink-primary">{rec.alternativeEmail}</span>
                                  </div>
                                  <div className="text-[11px] text-ink-muted">
                                    {lang === 'ar' ? 'السبب: ' : 'Reason: '}{rec.reason}
                                  </div>
                                  <div className="text-[10px] text-ink-muted flex items-center gap-3 pt-1">
                                    <span>{lang === 'ar' ? 'المنشئ: ' : 'Initiator: '}{rec.initiator.fullName}</span>
                                    {rec.reviewer && (
                                      <span>• {lang === 'ar' ? 'المعتمد: ' : 'Reviewer: '}{rec.reviewer.fullName}</span>
                                    )}
                                    <span>• {new Date(rec.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                      </div>
                    )}

                    {/* SECTION 5: AUDIT TRAIL */}
                    {detailSection === 'audit' && (
                      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 bg-elevated/40 border-b border-line flex items-center justify-between">
                          <h4 className="text-xs font-bold text-ink-primary flex items-center gap-2">
                            <IconAudit className="size-4 text-gold-500" />
                            <span>{lang === 'ar' ? 'سجل العمليات الإدارية والأمنية المرتبطة بالحساب' : 'Audit Trail for This Account'}</span>
                          </h4>
                          <span className="text-[11px] text-ink-muted">
                            {userDetail.auditLogs.length} {lang === 'ar' ? 'عملية مسجلة' : 'records'}
                          </span>
                        </div>

                        <div className="divide-y divide-line/60 text-xs">
                          {userDetail.auditLogs.length === 0 ? (
                            <div className="p-12 text-center text-ink-muted">
                              {lang === 'ar' ? 'لا توجد سجلات تدقيق سابقة لهذا الحساب' : 'No audit records found'}
                            </div>
                          ) : (
                            userDetail.auditLogs.map((log) => (
                              <div key={log.id} className="p-4 space-y-1.5 hover:bg-elevated/30 transition">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-ink-primary font-mono text-xs">
                                    {log.action}
                                  </span>
                                  <span className="text-[10px] font-mono text-ink-muted">
                                    {new Date(log.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                                  </span>
                                </div>
                                <div className="text-[11px] text-ink-secondary flex flex-wrap items-center gap-3">
                                  <span className="px-2 py-0.5 rounded bg-elevated border border-line text-[10px]">
                                    Category: {log.category}
                                  </span>
                                  {log.result && (
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.result === 'SUCCESS' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                      {log.result}
                                    </span>
                                  )}
                                  {log.ip && <span className="font-mono text-ink-muted">IP: {log.ip}</span>}
                                  {log.reason && <span>{log.reason}</span>}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: SUSPEND CONFIRMATION MODAL */}
      {/* ============================================================ */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="size-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <IconAlert className="size-5" />
              </div>
              <h3 className="text-base font-bold text-ink-primary">
                {lang === 'ar' ? 'تأكيد تعليق الحساب' : 'Confirm Account Suspension'}
              </h3>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              {lang === 'ar'
                ? 'تعليق الحساب سيؤدي إلى حظر دخول المستخدم فوراً، وإسقاط كافة جلساته النشطة، وتسجيل سبب التعليق في سجل التدقيق.'
                : 'Suspending this account immediately blocks logins and terminates all active user sessions.'}
            </p>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1.5">
                {lang === 'ar' ? 'سبب التعليق الإداري (إلزامي) *' : 'Suspension Reason (Required) *'}
              </label>
              <textarea
                rows={3}
                required
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder={lang === 'ar' ? 'اكتب سبب التعليق بالتفصيل...' : 'Enter reason'}
                className="w-full p-3 rounded-xl bg-surface border border-line text-ink-primary text-xs focus:border-rose-500 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSuspendModal(false)}
                className="px-4 py-2.5 rounded-xl bg-elevated border border-line text-xs font-semibold hover:bg-elevated/80 transition"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSuspend}
                disabled={suspending || !suspendReason.trim()}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs transition"
              >
                {suspending ? (lang === 'ar' ? 'جاري التعليق...' : 'Suspending...') : (lang === 'ar' ? 'تأكيد تعليق الحساب' : 'Confirm Suspension')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: PASSWORD RECOVERY CONFIRMATION MODAL */}
      {/* ============================================================ */}
      {showPasswordRecoveryConfirm && userDetail && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-gold-500">
              <div className="size-10 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                <IconKey className="size-5" />
              </div>
              <h3 className="text-base font-bold text-ink-primary">
                {lang === 'ar' ? 'تأكيد إرسال رابط الاستعادة' : 'Confirm Password Recovery'}
              </h3>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              {lang === 'ar'
                ? `هل أنت متأكد من إرسال رابط استعادة كلمة المرور المشفر إلى البريد الأصلي المسجل (${userDetail.email})؟ الرابط سيكون صالحاً لمدة 30 دقيقة فقط.`
                : `Are you sure you want to send a secure password recovery link to (${userDetail.email})?`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPasswordRecoveryConfirm(false)}
                className="px-4 py-2.5 rounded-xl bg-elevated border border-line text-xs font-semibold hover:bg-elevated/80 transition"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSendRecoveryEmail}
                disabled={sendingRecoveryEmail}
                className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition"
              >
                {sendingRecoveryEmail ? (lang === 'ar' ? 'جاري الإرسال...' : 'Sending...') : (lang === 'ar' ? 'تأكيد الإرسال الآن' : 'Confirm & Send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: DUAL-ADMIN REVIEW MODAL */}
      {/* ============================================================ */}
      {reviewRecoveryItem && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-surface border border-line rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-gold-500/10 border border-gold-500/20 text-gold-500 flex items-center justify-center shrink-0">
                <IconShieldKeyhole className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-primary">
                  {lang === 'ar' ? 'الاعتماد المزدوج لطلب الاستعادة' : 'Dual-Admin Recovery Approval'}
                </h3>
                <div className="text-xs font-mono text-gold-500">{reviewRecoveryItem.recoveryNo}</div>
              </div>
            </div>

            <div className="bg-elevated/40 border border-line rounded-xl p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-ink-muted">{lang === 'ar' ? 'صاحب الحساب:' : 'User:'}</span>
                <span className="font-semibold text-ink-primary">{reviewRecoveryItem.user.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">{lang === 'ar' ? 'البريد القديم:' : 'Old Email:'}</span>
                <span className="font-mono text-ink-secondary">{reviewRecoveryItem.originalEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">{lang === 'ar' ? 'البريد البديل الجديد:' : 'New Email:'}</span>
                <span className="font-mono font-bold text-emerald-500">{reviewRecoveryItem.alternativeEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">{lang === 'ar' ? 'طريقة التحقق:' : 'Verification:'}</span>
                <span className="text-ink-primary">{reviewRecoveryItem.verificationMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">{lang === 'ar' ? 'المشرف المنشئ للطلب:' : 'Initiator:'}</span>
                <span className="text-ink-primary">{reviewRecoveryItem.initiator.fullName}</span>
              </div>
            </div>

            {/* Self-Approval Block */}
            {reviewRecoveryItem.initiator.id === currentAdmin?.id ? (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 text-xs text-rose-600 font-semibold leading-relaxed">
                {lang === 'ar'
                  ? 'مخالفة أمنية: لا يمكنك اعتماد هذا الطلب لأنك أنت من أنشأه. يتطلب الاعتماد المزدوج مراجعة مشرف إداري آخر مصرح له.'
                  : 'Dual-approval violation: You cannot approve a request that you initiated.'}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-ink-muted mb-1.5 font-semibold">
                    {lang === 'ar' ? 'قرار المشرف *' : 'Decision *'}
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-600">
                      <input
                        type="radio"
                        name="decision"
                        checked={reviewDecision === 'APPROVED'}
                        onChange={() => setReviewDecision('APPROVED')}
                      />
                      <span>{lang === 'ar' ? 'موافقة واعتماد إرسال الرابط' : 'Approve & Send Link'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-rose-600">
                      <input
                        type="radio"
                        name="decision"
                        checked={reviewDecision === 'REJECTED'}
                        onChange={() => setReviewDecision('REJECTED')}
                      />
                      <span>{lang === 'ar' ? 'رفض الطلب' : 'Reject Request'}</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-ink-muted mb-1 font-semibold">
                    {lang === 'ar' ? 'ملاحظات المراجعة' : 'Review Notes'}
                  </label>
                  <textarea
                    rows={2}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder={lang === 'ar' ? 'تم تدقيق المستندات والموافقة على التفعيل...' : 'Notes'}
                    className="w-full p-2.5 rounded-xl bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewRecoveryItem(null)}
                className="px-4 py-2.5 rounded-xl bg-elevated border border-line text-xs font-semibold hover:bg-elevated/80 transition"
              >
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={submittingReview || reviewRecoveryItem.initiator.id === currentAdmin?.id}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition disabled:opacity-40 ${
                  reviewDecision === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {submittingReview
                  ? (lang === 'ar' ? 'جاري الاعتماد...' : 'Submitting...')
                  : reviewDecision === 'APPROVED'
                  ? (lang === 'ar' ? 'تأكيد الاعتماد والإرسال' : 'Confirm & Approve')
                  : (lang === 'ar' ? 'تأكيد الرفض' : 'Confirm Rejection')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
