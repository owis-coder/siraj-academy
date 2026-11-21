import { useEffect, useState, useMemo } from 'react';
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

  // User Detail Drawer State
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'security' | 'password_recovery' | 'alt_recovery' | 'audit'>('overview');

  // Edit Forms States
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

  // Role Change
  const [newRole, setNewRole] = useState<string>('');
  const [roleConfirmed, setRoleConfirmed] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  // Suspend Dialog
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);

  // Alternative Recovery Form
  const [altEmail, setAltEmail] = useState('');
  const [altReason, setAltReason] = useState('');
  const [altVerificationMethod, setAltVerificationMethod] = useState<string>('NATIONAL_ID');
  const [altNotes, setAltNotes] = useState('');
  const [altEvidenceRef, setAltEvidenceRef] = useState('');
  const [submittingAltRecovery, setSubmittingAltRecovery] = useState(false);

  // Review Modal State
  const [reviewRecoveryItem, setReviewRecoveryItem] = useState<AdminRecoveryItem | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Fetch Stats
  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const res = await api.admin.users.stats();
      setStats(res.data);
    } catch (err: any) {
      console.error('Failed to load user management stats', err);
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
      setUsers(res.data.items);
      setTotalPages(res.data.totalPages || 1);
    } catch (err: any) {
      toast.push('error', err.message || 'فشل تحميل قائمة المستخدمين');
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
      });
      setRecoveries(res.data.items);
      setRecoveryTotalPages(res.data.totalPages || 1);
    } catch (err: any) {
      toast.push('error', err.message || 'فشل تحميل طلبات الاستعادة');
    } finally {
      setLoadingRecoveries(false);
    }
  };

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
    setDetailTab('overview');
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
      toast.push('success', 'تم تحديث الملف الشخصي بنجاح');
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || 'فشل تحديث الملف الشخصي');
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
      toast.push('success', 'تم تغيير اسم المستخدم بنجاح');
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || 'فشل تغيير اسم المستخدم');
    } finally {
      setSavingUsername(false);
    }
  };

  // Save Direct Email
  const handleSaveDirectEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId) return;
    if (!newDirectEmail || !directEmailReason) {
      toast.push('info', 'يرجى كتابة البريد الجديد والسبب الإداري');
      return;
    }
    setSavingDirectEmail(true);
    try {
      await api.admin.users.changeEmail(activeUserId, {
        email: newDirectEmail,
        reason: directEmailReason,
      });
      toast.push('success', 'تم تعديل البريد الإلكتروني بنجاح وتسجيل العملية');
      setNewDirectEmail('');
      setDirectEmailReason('');
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || 'فشل تعديل البريد الإلكتروني');
    } finally {
      setSavingDirectEmail(false);
    }
  };

  // Save Role
  const handleSaveRole = async () => {
    if (!activeUserId) return;
    if (!roleConfirmed) {
      toast.push('info', 'يرجى تأكيد الرغبة في تغيير دور المستخدم');
      return;
    }
    setSavingRole(true);
    try {
      await api.admin.users.changeRole(activeUserId, { role: newRole, confirm: true });
      toast.push('success', `تم تغيير دور الحساب بنجاح إلى ${newRole}`);
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || 'فشل تغيير دور الحساب');
    } finally {
      setSavingRole(false);
    }
  };

  // Suspend User
  const handleSuspend = async () => {
    if (!activeUserId || !suspendReason) {
      toast.push('info', 'يرجى توضيح سبب تعليق الحساب');
      return;
    }
    setSuspending(true);
    try {
      await api.admin.users.suspend(activeUserId, { reason: suspendReason });
      toast.push('success', 'تم تعليق الحساب وإنهاء جلساته بنجاح');
      setShowSuspendModal(false);
      setSuspendReason('');
      openUserDetail(activeUserId);
      loadUsers();
      loadStats();
    } catch (err: any) {
      toast.push('error', err.message || 'فشل تعليق الحساب');
    } finally {
      setSuspending(false);
    }
  };

  // Reactivate User
  const handleReactivate = async () => {
    if (!activeUserId) return;
    try {
      await api.admin.users.reactivate(activeUserId);
      toast.push('success', 'تمت إعادة تفعيل الحساب بنجاح');
      openUserDetail(activeUserId);
      loadUsers();
      loadStats();
    } catch (err: any) {
      toast.push('error', err.message || 'فشل تفعيل الحساب');
    }
  };

  // Revoke All Sessions
  const handleRevokeSessions = async () => {
    if (!activeUserId) return;
    try {
      await api.admin.users.revokeSessions(activeUserId);
      toast.push('success', 'تم إسقاط وإلغاء كافة الجلسات النشطة للمستخدم بنجاح');
      openUserDetail(activeUserId);
      loadUsers();
    } catch (err: any) {
      toast.push('error', err.message || 'فشل إلغاء الجلسات');
    }
  };

  // Trigger Original Email Password Recovery
  const handleSendRecoveryEmail = async () => {
    if (!activeUserId) return;
    try {
      const res = await api.admin.users.sendRecoveryEmail(activeUserId);
      toast.push('success', res.data?.message || 'تم إرسال رابط استعادة كلمة المرور إلى البريد المسجل بنجاح');
      openUserDetail(activeUserId);
    } catch (err: any) {
      toast.push('error', err.message || 'فشل إرسال رابط استعادة كلمة المرور');
    }
  };

  // Submit Alternative Recovery Request
  const handleSubmitAltRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId) return;
    if (!altEmail || !altReason) {
      toast.push('info', 'يرجى إدخال البريد البديل وسبب فقدان البريد الأصلي');
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
      toast.push('success', res.data?.message || 'تم إنشاء طلب الاستعادة بنجاح');
      setAltEmail('');
      setAltReason('');
      setAltNotes('');
      setAltEvidenceRef('');
      openUserDetail(activeUserId);
      loadStats();
      loadRecoveries();
    } catch (err: any) {
      toast.push('error', err.message || 'فشل إنشاء طلب استعادة الحساب');
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
      toast.push('success', res.data?.message || 'تم اعتماد مراجعة الطلب بنجاح');
      setReviewRecoveryItem(null);
      setReviewNotes('');
      loadRecoveries();
      loadStats();
      if (activeUserId) openUserDetail(activeUserId);
    } catch (err: any) {
      toast.push('error', err.message || 'فشل اعتماد مراجعة الطلب');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-primary">
            {lang === 'ar' ? 'إدارة حسابات المستخدمين واستعادتها' : 'User Account Management & Recovery'}
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            {lang === 'ar'
              ? 'إدارة شاملة لحسابات الطلاب والمدرسين، التوثيق، الصلاحيات، وإجراءات استعادة الحسابات الحساسة'
              : 'Complete administration for student and teacher accounts, verification, permissions, and security recovery'}
          </p>
        </div>

        {/* Main Tab Switcher */}
        <div className="inline-flex rounded-xl bg-surface border border-line p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMainTab('users')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              mainTab === 'users'
                ? 'bg-gold-500 text-slate-950 shadow'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            {lang === 'ar' ? 'دليل المستخدمين' : 'User Directory'}
          </button>
          <button
            type="button"
            onClick={() => setMainTab('recoveries')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition relative ${
              mainTab === 'recoveries'
                ? 'bg-gold-500 text-slate-950 shadow'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <span>{lang === 'ar' ? 'طلبات الاستعادة' : 'Recovery Requests'}</span>
            {stats && stats.pendingRecoveriesCount > 0 && (
              <span className="ms-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                {stats.pendingRecoveriesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Stats Counter Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-surface border border-line rounded-xl p-3 shadow-sm">
          <div className="text-[11px] text-ink-muted">{lang === 'ar' ? 'إجمالي المستخدمين' : 'Total Users'}</div>
          <div className="text-xl font-bold text-ink-primary mt-1">{stats?.totalUsers ?? '...'}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3 shadow-sm">
          <div className="text-[11px] text-ink-muted">{lang === 'ar' ? 'الطلاب' : 'Students'}</div>
          <div className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1">{stats?.studentsCount ?? '...'}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3 shadow-sm">
          <div className="text-[11px] text-ink-muted">{lang === 'ar' ? 'المدرسون' : 'Teachers'}</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats?.teachersCount ?? '...'}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3 shadow-sm">
          <div className="text-[11px] text-ink-muted">{lang === 'ar' ? 'الحسابات النشطة' : 'Active'}</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats?.activeCount ?? '...'}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3 shadow-sm">
          <div className="text-[11px] text-ink-muted">{lang === 'ar' ? 'الحسابات المعلقة' : 'Suspended'}</div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">{stats?.suspendedCount ?? '...'}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3 shadow-sm">
          <div className="text-[11px] text-ink-muted">{lang === 'ar' ? 'بريد غير موثق' : 'Unverified Email'}</div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats?.unverifiedCount ?? '...'}</div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-3 shadow-sm">
          <div className="text-[11px] text-ink-muted">{lang === 'ar' ? 'بانتظار الاعتماد' : 'Pending Approval'}</div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">{stats?.pendingRecoveriesCount ?? '...'}</div>
        </div>
      </div>

      {/* Main Tab 1: User Directory */}
      {mainTab === 'users' && (
        <div className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
          {/* Filters & Search Toolbar */}
          <div className="p-4 border-b border-line flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-elevated/30">
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
                className="w-full ltr:pl-9 rtl:pr-9 ltr:pr-4 rtl:pl-4 py-2 rounded-xl bg-surface border border-line text-sm text-ink-primary focus:border-gold-500 outline-none transition"
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
                className="px-3 py-2 rounded-xl bg-surface border border-line text-xs text-ink-primary outline-none focus:border-gold-500"
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
                className="p-2 rounded-xl bg-surface border border-line text-ink-secondary hover:text-ink-primary hover:bg-elevated transition"
                title={lang === 'ar' ? 'إعادة ضبط' : 'Reset'}
              >
                <IconRefresh className="size-4" />
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-elevated/60 text-ink-muted border-b border-line uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'المستخدم' : 'User'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'الدور' : 'Role'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'الجلسات' : 'Sessions'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'تاريخ التسجيل' : 'Registered'}</th>
                  <th className="py-3 px-4 text-center">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-ink-secondary">
                      <div className="inline-block size-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin mb-2" />
                      <div>{lang === 'ar' ? 'جاري تحميل المستخدمين...' : 'Loading users...'}</div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-ink-secondary">
                      {lang === 'ar' ? 'لا توجد حسابات مطابقة لمعايير البحث' : 'No users match criteria'}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-elevated/40 transition">
                      {/* Name & Username */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-gold-500/10 text-gold-500 font-bold flex items-center justify-center text-sm border border-gold-500/20">
                            {u.fullName.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-semibold text-ink-primary flex items-center gap-1.5">
                              <span>{u.fullName}</span>
                              {u.recoveryRequestsCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                                  {lang === 'ar' ? 'طلب استعادة' : 'Recovery'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-ink-muted">@{u.username}</div>
                          </div>
                        </div>
                      </td>

                      {/* Email & Verification */}
                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-secondary">{u.email}</span>
                          {u.emailVerified ? (
                            <span title={lang === 'ar' ? 'موثق' : 'Verified'} className="text-emerald-500">
                              <IconCheck className="size-3.5" />
                            </span>
                          ) : (
                            <span
                              title={lang === 'ar' ? 'غير موثق' : 'Unverified'}
                              className="px-1 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-600"
                            >
                              !
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3 px-4">
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
                            ? lang === 'ar'
                              ? 'مدير نظام'
                              : 'Admin'
                            : u.role === 'TEACHER'
                            ? lang === 'ar'
                              ? 'مدرس'
                              : 'Teacher'
                            : lang === 'ar'
                            ? 'طالب'
                            : 'Student'}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                            u.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold border border-rose-500/30'
                          }`}
                        >
                          {u.status === 'ACTIVE'
                            ? lang === 'ar'
                              ? 'نشط'
                              : 'Active'
                            : lang === 'ar'
                            ? 'معلق'
                            : 'Suspended'}
                        </span>
                      </td>

                      {/* Active Sessions */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-elevated border border-line text-ink-secondary text-[11px]">
                          {u.activeSessionsCount}{' '}
                          {lang === 'ar' ? 'جلسة' : 'sessions'}
                        </span>
                      </td>

                      {/* Created At */}
                      <td className="py-3 px-4 text-ink-muted">
                        {new Date(u.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => openUserDetail(u.id)}
                          className="px-3 py-1.5 rounded-xl bg-gold-500/15 hover:bg-gold-500/25 text-gold-400 font-semibold text-xs transition border border-gold-500/30"
                        >
                          {lang === 'ar' ? 'إدارة الحساب' : 'Manage Account'}
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
          <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-3 bg-elevated/30">
            <h2 className="text-sm font-bold text-ink-primary">
              {lang === 'ar' ? 'سجل كافة طلبات استعادة الحسابات بالبريد البديل' : 'Account Alternative Recovery Log'}
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={recoveryStatusFilter}
                onChange={(e) => {
                  setRecoveryStatusFilter(e.target.value);
                  setRecoveryPage(1);
                }}
                className="px-3 py-1.5 rounded-xl bg-surface border border-line text-xs text-ink-primary outline-none focus:border-gold-500"
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
                className="p-2 rounded-xl bg-surface border border-line text-ink-secondary hover:text-ink-primary transition"
              >
                <IconRefresh className="size-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-elevated/60 text-ink-muted border-b border-line uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'رقم الطلب' : 'Recovery No'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'صاحب الحساب' : 'Account Owner'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'البريد البديل الجديد' : 'New Alternative Email'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'التحقق' : 'Verification'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'مستوى الخطورة' : 'Risk'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'ar' ? 'المشرف المنشئ' : 'Initiator'}</th>
                  <th className="py-3 px-4 text-center">{lang === 'ar' ? 'الإجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {loadingRecoveries ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-ink-secondary">
                      <div className="inline-block size-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin mb-2" />
                      <div>{lang === 'ar' ? 'جاري تحميل طلبات الاستعادة...' : 'Loading recovery requests...'}</div>
                    </td>
                  </tr>
                ) : recoveries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-ink-secondary">
                      {lang === 'ar' ? 'لا توجد طلبات استعادة مطابقة' : 'No recovery requests found'}
                    </td>
                  </tr>
                ) : (
                  recoveries.map((r) => (
                    <tr key={r.id} className="hover:bg-elevated/40 transition">
                      <td className="py-3 px-4 font-mono font-bold text-gold-500">{r.recoveryNo}</td>
                      <td className="py-3 px-4 font-medium text-ink-primary">
                        {r.user.fullName} (@{r.user.username})
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {r.alternativeEmail}
                      </td>
                      <td className="py-3 px-4 text-ink-secondary">
                        <div>{r.verificationMethod}</div>
                        {r.evidenceRef && <div className="text-[10px] text-ink-muted">Ref: {r.evidenceRef}</div>}
                      </td>
                      <td className="py-3 px-4">
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
                      <td className="py-3 px-4">
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
                            ? lang === 'ar'
                              ? 'مكتمل'
                              : 'Completed'
                            : r.status === 'PENDING_APPROVAL'
                            ? lang === 'ar'
                              ? 'بانتظار الاعتماد'
                              : 'Pending Approval'
                            : r.status === 'VERIFICATION_SENT'
                            ? lang === 'ar'
                              ? 'أُرسل الرابط'
                              : 'Link Sent'
                            : lang === 'ar'
                            ? 'مرفوض/ملغي'
                            : r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-ink-muted">{r.initiator.fullName}</td>
                      <td className="py-3 px-4 text-center">
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

      {/* Comprehensive User Detail Drawer */}
      {activeUserId && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-3xl bg-surface border-s border-line shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-line flex items-center justify-between bg-elevated/40">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-gold-500/20 text-gold-400 font-bold flex items-center justify-center text-base border border-gold-500/30">
                  {userDetail?.fullName.slice(0, 1) || 'U'}
                </div>
                <div>
                  <h2 className="text-base font-bold text-ink-primary flex items-center gap-2">
                    <span>{userDetail?.fullName}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                        userDetail?.status === 'ACTIVE'
                          ? 'bg-emerald-500/15 text-emerald-600'
                          : 'bg-rose-500/15 text-rose-600 font-bold'
                      }`}
                    >
                      {userDetail?.status}
                    </span>
                  </h2>
                  <div className="text-xs text-ink-muted font-mono flex items-center gap-2 mt-0.5">
                    <span>@{userDetail?.username}</span>
                    <span>•</span>
                    <span>ID: {userDetail?.id}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveUserId(null)}
                className="size-8 rounded-lg hover:bg-elevated flex items-center justify-center text-ink-muted hover:text-ink-primary transition"
              >
                <IconClose className="size-5" />
              </button>
            </div>

            {/* Risk Assessment Banner */}
            {userDetail?.risk.isHighRisk && (
              <div className="bg-rose-500/10 border-b border-rose-500/20 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <IconAlert className="size-4 shrink-0 mt-0.5 text-rose-500" />
                <div>
                  <strong className="font-semibold">
                    {lang === 'ar' ? 'تنبيه أمني — حساب عالي الخطورة:' : 'Security Alert — High Risk Account:'}
                  </strong>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[11px]">
                    {userDetail.risk.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  <div className="text-[10px] opacity-80 mt-1">
                    {lang === 'ar'
                      ? 'أي استعادة بريد بديل لهذا الحساب تتطلب اعتمادًا إلزاميًا من مشرف ثانٍ (Dual-Admin Approval).'
                      : 'Alternative email recovery requires mandatory dual approval.'}
                  </div>
                </div>
              </div>
            )}

            {/* Detail Tabs */}
            <div className="flex border-b border-line bg-elevated/20 px-4 text-xs font-semibold overflow-x-auto">
              <button
                type="button"
                onClick={() => setDetailTab('overview')}
                className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
                  detailTab === 'overview'
                    ? 'border-gold-500 text-gold-500'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {lang === 'ar' ? '1. البيانات وتعديل الملف' : 'Profile & Edit'}
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('security')}
                className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
                  detailTab === 'security'
                    ? 'border-gold-500 text-gold-500'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {lang === 'ar' ? '2. الأمان والجلسات' : 'Security & Sessions'}
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('password_recovery')}
                className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
                  detailTab === 'password_recovery'
                    ? 'border-gold-500 text-gold-500'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {lang === 'ar' ? '3. استعادة كلمة المرور (البريد الأصلي)' : 'Original Email Recovery'}
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('alt_recovery')}
                className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
                  detailTab === 'alt_recovery'
                    ? 'border-gold-500 text-gold-500'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {lang === 'ar' ? '4. استعادة الحساب بالبريد البديل' : 'Alternative Email Recovery'}
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('audit')}
                className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
                  detailTab === 'audit'
                    ? 'border-gold-500 text-gold-500'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {lang === 'ar' ? '5. سجل التدقيق' : 'Audit Trail'}
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingDetail ? (
                <div className="py-20 text-center text-ink-secondary">
                  <div className="inline-block size-8 border-3 border-gold-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm">{lang === 'ar' ? 'جاري تحميل تفاصيل الحساب...' : 'Loading details...'}</p>
                </div>
              ) : userDetail ? (
                <>
                  {/* TAB 1: OVERVIEW & EDIT */}
                  {detailTab === 'overview' && (
                    <div className="space-y-6">
                      {/* Basic Info Summary */}
                      <div className="grid grid-cols-2 gap-3 bg-elevated/30 border border-line rounded-xl p-4 text-xs">
                        <div>
                          <span className="text-ink-muted">{lang === 'ar' ? 'البريد الإلكتروني:' : 'Email:'}</span>
                          <div className="font-mono font-bold text-ink-primary mt-0.5">{userDetail.email}</div>
                          <div className="text-[10px] text-ink-muted mt-0.5">
                            {userDetail.emailVerified
                              ? lang === 'ar'
                                ? 'تم التوثيق'
                                : 'Verified'
                              : lang === 'ar'
                              ? 'غير موثق'
                              : 'Unverified'}
                          </div>
                        </div>
                        <div>
                          <span className="text-ink-muted">{lang === 'ar' ? 'رقم الواتساب:' : 'WhatsApp:'}</span>
                          <div className="font-mono text-ink-primary mt-0.5">{userDetail.whatsapp || '—'}</div>
                        </div>
                        <div>
                          <span className="text-ink-muted">{lang === 'ar' ? 'الدور الحالي:' : 'Current Role:'}</span>
                          <div className="font-bold text-ink-primary mt-0.5">{userDetail.role}</div>
                        </div>
                        <div>
                          <span className="text-ink-muted">{lang === 'ar' ? 'المستوى الدراسي:' : 'Level:'}</span>
                          <div className="text-ink-primary mt-0.5">{userDetail.level || '—'}</div>
                        </div>
                      </div>

                      {/* Edit Profile Form */}
                      <form onSubmit={handleSaveProfile} className="bg-surface border border-line rounded-xl p-4 space-y-4">
                        <h3 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                          <IconEdit className="size-4 text-gold-500" />
                          <span>{lang === 'ar' ? 'تعديل الملف الشخصي' : 'Edit Profile Information'}</span>
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-ink-muted mb-1">{lang === 'ar' ? 'الاسم الكامل' : 'Full Name'}</label>
                            <input
                              type="text"
                              value={editFullName}
                              onChange={(e) => setEditFullName(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-ink-muted mb-1">{lang === 'ar' ? 'رقم الواتساب' : 'WhatsApp'}</label>
                            <input
                              type="text"
                              value={editWhatsapp}
                              onChange={(e) => setEditWhatsapp(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                            />
                          </div>
                        </div>
                        <div className="text-xs">
                          <label className="block text-ink-muted mb-1">{lang === 'ar' ? 'المستوى الدراسي' : 'Academic Level'}</label>
                          <input
                            type="text"
                            value={editLevel}
                            onChange={(e) => setEditLevel(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                          />
                        </div>
                        {userDetail.teacherProfile && (
                          <div className="text-xs">
                            <label className="block text-ink-muted mb-1">{lang === 'ar' ? 'نبذة المدرس' : 'Teacher Bio'}</label>
                            <textarea
                              rows={2}
                              value={editBio}
                              onChange={(e) => setEditBio(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                            />
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={savingProfile}
                          className="px-4 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition"
                        >
                          {savingProfile ? 'جاري الحفظ...' : 'حفظ تعديلات الملف'}
                        </button>
                      </form>

                      {/* Change Username Box */}
                      <form onSubmit={handleSaveUsername} className="bg-surface border border-line rounded-xl p-4 space-y-3">
                        <h3 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                          <IconKey className="size-4 text-gold-500" />
                          <span>{lang === 'ar' ? 'تغيير اسم المستخدم (مع التحقق من الفرادة)' : 'Change Username'}</span>
                        </h3>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs font-mono focus:border-gold-500 outline-none"
                            placeholder="username"
                          />
                          <button
                            type="submit"
                            disabled={savingUsername || newUsername === userDetail.username}
                            className="px-4 py-2 rounded-lg bg-elevated border border-line hover:bg-elevated/80 disabled:opacity-40 text-ink-primary font-bold text-xs transition"
                          >
                            {savingUsername ? 'جاري الحفظ...' : 'تحديث اسم المستخدم'}
                          </button>
                        </div>
                      </form>

                      {/* Direct Email Change Box */}
                      <form onSubmit={handleSaveDirectEmail} className="bg-surface border border-line rounded-xl p-4 space-y-3">
                        <h3 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                          <IconAlert className="size-4 text-amber-500" />
                          <span>{lang === 'ar' ? 'تغيير البريد الإلكتروني المباشر (مع سبب إداري)' : 'Direct Email Change'}</span>
                        </h3>
                        <p className="text-[11px] text-ink-muted leading-relaxed">
                          {lang === 'ar'
                            ? 'ملاحظة: هذا الإجراء يحدث البريد مباشرة ويقوم بإنهاء كافة الجلسات النشطة للمستخدم وتسجيل الحدث في سجل التدقيق.'
                            : 'This updates email directly, terminates active sessions, and writes audit record.'}
                        </p>
                        <div className="space-y-2">
                          <input
                            type="email"
                            value={newDirectEmail}
                            onChange={(e) => setNewDirectEmail(e.target.value)}
                            placeholder="new.email@example.com"
                            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs font-mono focus:border-gold-500 outline-none"
                          />
                          <input
                            type="text"
                            value={directEmailReason}
                            onChange={(e) => setDirectEmailReason(e.target.value)}
                            placeholder={lang === 'ar' ? 'السبب الإداري للتعديل المباشر (إلزامي)' : 'Administrative reason'}
                            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                          />
                          <button
                            type="submit"
                            disabled={savingDirectEmail || !newDirectEmail || !directEmailReason}
                            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition"
                          >
                            {savingDirectEmail ? 'جاري التعديل...' : 'تحديث البريد مباشرة'}
                          </button>
                        </div>
                      </form>

                      {/* Role Management Protected Box */}
                      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
                        <h3 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                          <IconShieldKeyhole className="size-4 text-purple-500" />
                          <span>{lang === 'ar' ? 'تعديل دور الحساب (إجراء محمي منفصل)' : 'Role Management'}</span>
                        </h3>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                          <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            disabled={userDetail.id === currentAdmin?.id}
                            className="px-3 py-2 rounded-lg bg-surface border border-line text-xs font-bold text-ink-primary"
                          >
                            <option value="STUDENT">طالب (STUDENT)</option>
                            <option value="TEACHER">مدرس (TEACHER)</option>
                            <option value="ADMIN">مدير نظام (ADMIN)</option>
                          </select>

                          <label className="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer">
                            <input
                              type="checkbox"
                              checked={roleConfirmed}
                              onChange={(e) => setRoleConfirmed(e.target.checked)}
                              disabled={userDetail.id === currentAdmin?.id}
                              className="rounded border-line"
                            />
                            <span>{lang === 'ar' ? 'أؤكد تغيير دور الحساب وإسقاط جلساته' : 'Confirm role change'}</span>
                          </label>

                          <button
                            type="button"
                            onClick={handleSaveRole}
                            disabled={savingRole || !roleConfirmed || newRole === userDetail.role || userDetail.id === currentAdmin?.id}
                            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs transition"
                          >
                            {savingRole ? 'جاري التطبيق...' : 'تطبيق تغيير الدور'}
                          </button>
                        </div>
                        {userDetail.id === currentAdmin?.id && (
                          <p className="text-[11px] text-rose-500 font-semibold">
                            {lang === 'ar'
                              ? 'حماية أمنية: لا يمكن للمشرف تعديل صلاحيات حسابه الإداري الخاص.'
                              : 'Security protection: Administrators cannot modify their own role.'}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: SECURITY & SESSIONS */}
                  {detailTab === 'security' && (
                    <div className="space-y-6">
                      {/* Account Action Buttons */}
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={handleRevokeSessions}
                          className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-xs transition flex items-center gap-2"
                        >
                          <IconProhibited className="size-4" />
                          <span>{lang === 'ar' ? 'إلغاء كافة الجلسات النشطة للمستخدم' : 'Revoke All Active Sessions'}</span>
                        </button>

                        {userDetail.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={() => setShowSuspendModal(true)}
                            disabled={userDetail.id === currentAdmin?.id}
                            className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold text-xs transition flex items-center gap-2 disabled:opacity-40"
                          >
                            <IconLock className="size-4" />
                            <span>{lang === 'ar' ? 'تعليق الحساب مؤقتًا' : 'Suspend Account'}</span>
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

                      {/* Active Sessions List */}
                      <div className="bg-surface border border-line rounded-xl overflow-hidden">
                        <div className="p-3 bg-elevated/40 border-b border-line flex items-center justify-between">
                          <h4 className="text-xs font-bold text-ink-primary">
                            {lang === 'ar' ? 'الجلسات والأجهزة المسجلة' : 'Registered Devices & Sessions'}
                          </h4>
                          <span className="text-[11px] font-mono text-ink-muted">
                            SessionVersion: {userDetail.sessionVersion}
                          </span>
                        </div>
                        <div className="divide-y divide-line/60 text-xs">
                          {userDetail.sessions.length === 0 ? (
                            <div className="p-6 text-center text-ink-muted">
                              {lang === 'ar' ? 'لا توجد جلسات مسجلة' : 'No recorded sessions'}
                            </div>
                          ) : (
                            userDetail.sessions.map((s) => (
                              <div key={s.id} className="p-3 flex items-center justify-between">
                                <div>
                                  <div className="font-mono text-ink-primary text-xs">
                                    IP: {s.ip || '—'}
                                  </div>
                                  <div className="text-[11px] text-ink-muted truncate max-w-md">
                                    {s.userAgent || 'Unknown Device'}
                                  </div>
                                </div>
                                <div className="text-end">
                                  {s.endedAt ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-500/10 text-ink-muted">
                                      {lang === 'ar' ? 'مُنتهية' : 'Ended'} ({s.endReason || '—'})
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-600 font-bold">
                                      {lang === 'ar' ? 'نشطة الآن' : 'Active'}
                                    </span>
                                  )}
                                  <div className="text-[10px] text-ink-muted mt-0.5">
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

                  {/* TAB 3: PASSWORD RECOVERY (ORIGINAL EMAIL) */}
                  {detailTab === 'password_recovery' && (
                    <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <IconKey className="size-5 text-gold-500" />
                        <h3 className="text-sm font-bold text-ink-primary">
                          {lang === 'ar' ? 'استعادة كلمة المرور عبر البريد المسجل الأصلي' : 'Original Email Password Recovery'}
                        </h3>
                      </div>

                      <p className="text-xs text-ink-secondary leading-relaxed">
                        {lang === 'ar'
                          ? 'يقوم هذا الإجراء بتوليد رمز أمان عشوائي أحادي الاستخدام مشفر (SHA-256) وإرسال رابط استعادة صالح لمدة 30 دقيقة إلى البريد المسجل للحساب، مع إبطال كافة الرموز السابقة وتسجيل الحدث في سجل التدقيق.'
                          : 'Generates single-use, cryptographically secure 30-min recovery link to the user’s currently registered email.'}
                      </p>

                      <div className="bg-elevated/40 border border-line rounded-xl p-4 text-xs space-y-1">
                        <div className="text-ink-muted">{lang === 'ar' ? 'البريد الإلكتروني المستهدف:' : 'Target Email:'}</div>
                        <div className="text-sm font-mono font-bold text-ink-primary">{userDetail.email}</div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSendRecoveryEmail}
                        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold text-xs transition shadow-md flex items-center justify-center gap-2"
                      >
                        <IconKey className="size-4" />
                        <span>{lang === 'ar' ? 'إرسال رابط الاستعادة إلى البريد الأصلي' : 'Send Recovery Link to Email'}</span>
                      </button>
                    </div>
                  )}

                  {/* TAB 4: ALTERNATIVE EMAIL RECOVERY (LOST ORIGINAL EMAIL) */}
                  {detailTab === 'alt_recovery' && (
                    <div className="space-y-6">
                      <form onSubmit={handleSubmitAltRecovery} className="bg-surface border border-line rounded-xl p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <IconShieldKeyhole className="size-5 text-rose-500" />
                          <h3 className="text-sm font-bold text-ink-primary">
                            {lang === 'ar'
                              ? 'استعادة الحساب عبر البريد البديل (عند فقدان البريد الأصلي نهائيًا)'
                              : 'Alternative Email Recovery (Lost Original Email)'}
                          </h3>
                        </div>

                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                          <strong>{lang === 'ar' ? 'تنبيه أمني هام:' : 'Critical Security Notice:'}</strong>{' '}
                          {lang === 'ar'
                            ? 'هذا الإجراء مخصص فقط للعملاء الذين فقدوا الوصول لبريدهم الأصلي بعد التحقق الرسمي من الهوية. الحسابات عالية الخطورة ستتطلب اعتمادًا إضافيًا من مشرف آخر قبل إرسال رابط التفعيل.'
                            : 'This sensitive takeover workflow requires identity verification. High-risk accounts require dual-admin approval.'}
                        </div>

                        <div className="space-y-3 text-xs">
                          <div>
                            <label className="block text-ink-muted mb-1 font-semibold">
                              {lang === 'ar' ? 'البريد الإلكتروني البديل الجديد *' : 'New Alternative Email *'}
                            </label>
                            <input
                              type="email"
                              required
                              value={altEmail}
                              onChange={(e) => setAltEmail(e.target.value)}
                              placeholder="alt.email@domain.com"
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs font-mono focus:border-gold-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-ink-muted mb-1 font-semibold">
                              {lang === 'ar' ? 'سبب فقدان الوصول للبريد الأصلي *' : 'Reason for Lost Email Access *'}
                            </label>
                            <textarea
                              required
                              rows={2}
                              value={altReason}
                              onChange={(e) => setAltReason(e.target.value)}
                              placeholder={lang === 'ar' ? 'مثال: تعطل نطاق الجامعة السابق / اختراق الحساب القديم / ...' : 'Reason for loss'}
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-ink-muted mb-1 font-semibold">
                                {lang === 'ar' ? 'طريقة التحقق من الهوية *' : 'Verification Method *'}
                              </label>
                              <select
                                value={altVerificationMethod}
                                onChange={(e) => setAltVerificationMethod(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
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
                              <label className="block text-ink-muted mb-1 font-semibold">
                                {lang === 'ar' ? 'الرقم المرجعي للإثبات / التذكرة' : 'Evidence Ref / Ticket ID'}
                              </label>
                              <input
                                type="text"
                                value={altEvidenceRef}
                                onChange={(e) => setAltEvidenceRef(e.target.value)}
                                placeholder="TICK-10294"
                                className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs font-mono focus:border-gold-500 outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-ink-muted mb-1 font-semibold">
                              {lang === 'ar' ? 'ملاحظات التحقق الإدارية' : 'Verification Notes'}
                            </label>
                            <input
                              type="text"
                              value={altNotes}
                              onChange={(e) => setAltNotes(e.target.value)}
                              placeholder={lang === 'ar' ? 'تمت مطابقة رقم الجوال المسجل والسجل الأكاديمي بنجاح' : 'Notes'}
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={submittingAltRecovery}
                          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-md flex items-center justify-center gap-2"
                        >
                          <IconShieldKeyhole className="size-4" />
                          <span>{submittingAltRecovery ? 'جاري المعالجة...' : 'بدء إجراء الاستعادة بالبريد البديل'}</span>
                        </button>
                      </form>

                      {/* User's Recovery Requests History */}
                      <div className="bg-surface border border-line rounded-xl overflow-hidden">
                        <div className="p-3 bg-elevated/40 border-b border-line">
                          <h4 className="text-xs font-bold text-ink-primary">
                            {lang === 'ar' ? 'سجل طلبات استعادة هذا الحساب' : 'Recovery History for This Account'}
                          </h4>
                        </div>
                        <div className="divide-y divide-line/60 text-xs">
                          {userDetail.recoveries.length === 0 ? (
                            <div className="p-6 text-center text-ink-muted">
                              {lang === 'ar' ? 'لا توجد طلبات استعادة سابقة' : 'No previous recovery requests'}
                            </div>
                          ) : (
                            userDetail.recoveries.map((rec) => (
                              <div key={rec.id} className="p-3.5 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-gold-500">{rec.recoveryNo}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      rec.status === 'COMPLETED'
                                        ? 'bg-emerald-500/15 text-emerald-600'
                                        : rec.status === 'PENDING_APPROVAL'
                                        ? 'bg-amber-500/15 text-amber-600'
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
                                  {lang === 'ar' ? 'السبب: ' : 'Reason: '}
                                  {rec.reason}
                                </div>
                                <div className="text-[10px] text-ink-muted flex items-center gap-3">
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

                  {/* TAB 5: AUDIT TRAIL */}
                  {detailTab === 'audit' && (
                    <div className="bg-surface border border-line rounded-xl overflow-hidden">
                      <div className="p-3 bg-elevated/40 border-b border-line flex items-center gap-2">
                        <IconAudit className="size-4 text-gold-500" />
                        <h4 className="text-xs font-bold text-ink-primary">
                          {lang === 'ar' ? 'سجل العمليات الإدارية والأمنية المرتبطة بالحساب' : 'Audit Trail for This Account'}
                        </h4>
                      </div>
                      <div className="divide-y divide-line/60 text-xs">
                        {userDetail.auditLogs.length === 0 ? (
                          <div className="p-6 text-center text-ink-muted">
                            {lang === 'ar' ? 'لا توجد سجلات تدقيق سابقة' : 'No audit records'}
                          </div>
                        ) : (
                          userDetail.auditLogs.map((log) => (
                            <div key={log.id} className="p-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-ink-primary">{log.action}</span>
                                <span className="text-[10px] font-mono text-ink-muted">
                                  {new Date(log.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                                </span>
                              </div>
                              <div className="text-[11px] text-ink-muted flex items-center gap-3">
                                <span>Category: {log.category}</span>
                                {log.ip && <span>IP: {log.ip}</span>}
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
      )}

      {/* Suspend Confirmation Modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <IconAlert className="size-6 shrink-0" />
              <h3 className="text-base font-bold text-ink-primary">
                {lang === 'ar' ? 'تأكيد تعليق الحساب' : 'Confirm Account Suspension'}
              </h3>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              {lang === 'ar'
                ? 'تعليق الحساب سيؤدي إلى حظر دخول المستخدم فورًا وإسقاط كافة جلساته النشطة وإرسال بريد إلكتروني رسمي له بالسبب.'
                : 'Suspending this account terminates active sessions and notifies the user.'}
            </p>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">
                {lang === 'ar' ? 'سبب التعليق الإداري (إلزامي)' : 'Suspension Reason *'}
              </label>
              <textarea
                rows={3}
                required
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder={lang === 'ar' ? 'اكتب سبب التعليق...' : 'Enter reason'}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-rose-500 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSuspendModal(false)}
                className="px-4 py-2 rounded-xl bg-elevated border border-line text-xs font-semibold hover:bg-elevated/80 transition"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSuspend}
                disabled={suspending || !suspendReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs transition"
              >
                {suspending ? 'جاري التعليق...' : 'تأكيد تعليق الحساب'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dual Admin Review Modal */}
      {reviewRecoveryItem && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-surface border border-line rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <IconShieldKeyhole className="size-6 text-gold-500 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-ink-primary">
                  {lang === 'ar' ? 'الاعتماد المزدوج لطلب الاستعادة' : 'Dual-Admin Recovery Approval'}
                </h3>
                <div className="text-xs font-mono text-gold-500">{reviewRecoveryItem.recoveryNo}</div>
              </div>
            </div>

            <div className="bg-elevated/50 border border-line rounded-xl p-3 text-xs space-y-1.5">
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

            {/* Security Check Warning */}
            {reviewRecoveryItem.initiator.id === currentAdmin?.id ? (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-600 font-semibold leading-relaxed">
                {lang === 'ar'
                  ? 'مخالفة أمنية: لا يمكنك اعتماد هذا الطلب لأنك أنت من أنشأه. يتطلب الاعتماد المزدوج مراجعة مشرف آخر مصرح له.'
                  : 'Dual-approval violation: You cannot approve a request that you initiated.'}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-ink-muted mb-1 font-semibold">{lang === 'ar' ? 'قرار المشرف' : 'Decision'}</label>
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
                  <label className="block text-ink-muted mb-1 font-semibold">{lang === 'ar' ? 'ملاحظات المراجعة' : 'Review Notes'}</label>
                  <textarea
                    rows={2}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder={lang === 'ar' ? 'تم تدقيق المستندات والموافقة على التفعيل...' : 'Notes'}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-ink-primary text-xs focus:border-gold-500 outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewRecoveryItem(null)}
                className="px-4 py-2 rounded-xl bg-elevated border border-line text-xs font-semibold hover:bg-elevated/80 transition"
              >
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={submittingReview || reviewRecoveryItem.initiator.id === currentAdmin?.id}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition disabled:opacity-40 ${
                  reviewDecision === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {submittingReview ? 'جاري الاعتماد...' : reviewDecision === 'APPROVED' ? 'تأكيد الاعتماد والإرسال' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
