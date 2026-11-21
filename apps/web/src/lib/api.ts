/* عميل API موحد — عقد /api/v1 */
import ar from '../i18n/ar.json';
import en from '../i18n/en.json';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';

/** اللغة الحالية — كما يحفظها مزوّد الترجمة */
function currentLang(): 'ar' | 'en' {
  try {
    return window.localStorage.getItem('siraj_lang') === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

/** رسالة واجهة مترجمة (خارج مكونات React) */
function msg(key: string, vars?: Record<string, string | number>): string {
  const dict = (currentLang() === 'en' ? en : ar) as Record<string, string>;
  let text = dict[key] ?? (ar as Record<string, string>)[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{{${k}}}`, String(v));
  }
  return text;
}

/** هل النص يحتوي حروفًا عربية؟ (لاستبدال رسائل الخادم غير المترجمة) */
function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export type Meta = { page?: number; pageSize?: number; total?: number; totalPages?: number };

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  formData?: FormData;
  headers?: Record<string, string>;
};

function qs(query?: Options['query']) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function request<T>(path: string, opts: Options = {}): Promise<{ data: T; meta?: Meta }> {
  const { method = 'GET', body, query, formData, headers } = opts;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${qs(query)}`, {
      method,
      credentials: 'include',
      headers: {
        'Accept-Language': currentLang(),
        ...(formData ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, msg('errors.network'));
  }

  if (res.status === 204) return { data: undefined as T };

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* غير JSON */
    }
  }

  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; details?: unknown };
    let message = err.message || msg('errors.http', { status: res.status });

    // إخفاء أي تفاصيل تقنية داخلية من الظهور للمستخدم
    const hasTechnicalTerms = /prisma|postgres|postgresql|sqlite|mongodb|sql|syntaxerror|typeerror|uncaught|database|stack trace|node_modules/i.test(message);
    if (hasTechnicalTerms) {
      message = msg('errors.generic');
    } else if (currentLang() === 'en' && hasArabic(message)) {
      // لا نعرض رسالة عربية داخل واجهة إنجليزية إذا لم تُترجم من الخادم
      message =
        res.status === 401
          ? msg('errors.unauthorized')
          : res.status === 403
            ? msg('errors.forbidden')
            : res.status === 404
              ? msg('errors.notFound')
              : res.status === 400
                ? msg('errors.validation')
                : msg('errors.generic');
    }
    throw new ApiError(res.status, message, err.details);
  }

  const ok = (json ?? {}) as { data?: T; meta?: Meta };
  return { data: (ok.data !== undefined ? ok.data : (json as T)), meta: ok.meta };
}

/* ===================== أنواع مشتركة ===================== */

export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  whatsapp?: string | null;
  role: Role;
  emailVerified: boolean;
  emailVerifiedAt?: string | null;
  status?: string;
  level?: string | null;
  avatarUrl?: string | null;
  pendingEmail?: string | null;
  totpEnabled?: boolean;
  createdAt?: string;
  universityId?: string | null;
  majorId?: string | null;
  university?: { id: string; name: string } | null;
  major?: { id: string; name: string } | null;
  teacherProfile?: TeacherProfile | null;
}

export interface AccountSession {
  id: string;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: string;
  lastSeenAt: string;
  endedAt?: string | null;
  endReason?: string | null;
}

export interface MyProfile {
  user: User & {
    createdAt?: string;
    updatedAt?: string;
    pendingEmail?: string | null;
    avatarUrl?: string | null;
    teacherProfile?: TeacherProfile | null;
  };
  stats: { explainRequests: number; customRequests: number; enrollments: number };
}

export type CustomRequestType =
  | 'COURSE_EXPLAIN'
  | 'TOPIC_EXPLAIN'
  | 'TRANSLATION'
  | 'SUMMARY'
  | 'PPT'
  | 'PROGRAMMING_PROJECT'
  | 'OTHER';

export type CustomRequestStatus =
  | 'NEW'
  | 'UNDER_REVIEW'
  | 'AWAITING_RESPONSE'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export interface CustomServiceRequest {
  id: string;
  requestNo: string;
  userId: string;
  requestType: CustomRequestType;
  title: string;
  description: string;
  universityName?: string | null;
  majorName?: string | null;
  academicLevel?: string | null;
  deadline?: string | null;
  budget?: number | null;
  attachments?: Array<{ name: string; url: string; size?: number; type?: string }> | null;
  status: CustomRequestStatus;
  adminNotes?: string | null;
  emailSent: boolean;
  emailError?: string | null;
  emailSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    fullName: string;
    username: string;
    email: string;
    whatsapp?: string | null;
    role: string;
    level?: string | null;
    university?: { name: string } | null;
    major?: { name: string } | null;
  };
}

export interface TeacherProfile {
  id: string;
  userId: string;
  degree?: string | null;
  bio?: string | null;
  specialties?: string | null;
  universitiesText?: string | null;
  docsUrl?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  user?: User;
}

export interface University {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  logoUrl?: string | null;
  isVisible?: boolean;
  order?: number;
  coursesCount?: number;
  teachersCount?: number;
}

export interface College {
  id: string;
  universityId: string;
  name: string;
  coursesCount?: number;
}

export interface Major {
  id: string;
  universityId?: string | null;
  collegeId?: string | null;
  name: string;
}

export interface Course {
  id: string;
  universityId: string;
  collegeId?: string | null;
  majorId?: string | null;
  title: string;
  code?: string | null;
  level?: string | null;
  description?: string | null;
  isVisible?: boolean;
  coverUrl?: string | null;
  university?: University;
  college?: College | null;
  teacherNames?: string[] | string | null;
  minPrice?: number | null;
  enrollmentsCount?: number;
  offeringsCount?: number;
}

export interface Lesson {
  id: string;
  offeringId: string;
  title: string;
  videoUrl: string;
  access: 'TRIAL' | 'PAID';
  order: number;
}

export interface Offering {
  id: string;
  courseId: string;
  teacherId: string;
  title?: string | null;
  summary?: string | null;
  price: number;
  trialVideoUrl?: string | null;
  accessType?: 'TRIAL' | 'PAID';
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'HIDDEN' | 'REJECTED';
  adminNote?: string | null;
  teacher?: User & { teacherProfile?: TeacherProfile | null };
  teacherName?: string;
  teacherUsername?: string;
  course?: Course;
  lessons?: Lesson[];
  enrollmentsCount?: number;
  /** هل يملك المستخدم الحالي وصولًا كاملًا لدروس هذه الدورة تحديدًا (اشتراك/مالك/إدارة) */
  canSeeAllLessons?: boolean;
}

export interface Service {
  id: string;
  slug: string;
  title: string;
  category: string;
  description?: string | null;
  basePrice?: number | null;
  durationDays?: number | null;
  isActive?: boolean;
  isFeatured?: boolean;
}

export type RefundStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'NEEDS_INFORMATION'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'FAILED'
  | 'CANCELLED';

export type WithdrawalStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'NEEDS_INFORMATION'
  | 'APPROVED'
  | 'PROCESSING'
  | 'PAID'
  | 'REJECTED'
  | 'FAILED'
  | 'CANCELLED';

export interface RefundRequest {
  id: string;
  refundNo: string;
  orderId: string;
  studentId: string;
  amountRequested: number;
  amountApproved: number | null;
  currency: string;
  reason: string;
  notes: string | null;
  attachments?: unknown;
  status: RefundStatus;
  adminNotes: string | null;
  rejectionReason: string | null;
  transferProofUrl: string | null;
  transferReferenceNo: string | null;
  transferredAt: string | null;
  createdAt: string;
  updatedAt: string;
  student?: { id: string; fullName: string; username: string; email: string; whatsapp?: string };
  order?: { id: string; orderNo: string; title: string; amount: number; targetType: string };
  reviewer?: { id: string; fullName: string };
}

export interface TeacherPayoutMethod {
  id: string;
  bankName: string;
  accountHolderName: string;
  ibanMasked: string;
  isDefault: boolean;
  isVerified?: boolean;
  createdAt?: string;
}

export interface TeacherWithdrawal {
  id: string;
  withdrawalNo: string;
  teacherId: string;
  payoutMethodId: string;
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;
  status: WithdrawalStatus;
  adminNotes: string | null;
  rejectionReason: string | null;
  transferProofUrl: string | null;
  transferReferenceNo: string | null;
  transferredAt: string | null;
  createdAt: string;
  teacher?: { user?: { fullName: string; email: string; username?: string; whatsapp?: string } };
  payoutMethod?: { bankName: string; accountHolderName: string; ibanMasked: string };
  reviewer?: { fullName: string };
}

export interface TeacherWalletSummary {
  teacherId: string;
  currency: string;
  availableBalance: number;
  reservedBalance: number;
  earnedTotal: number;
  withdrawnTotal: number;
  pendingClearing: number;
  payoutMethods: TeacherPayoutMethod[];
  recentEarnings: Array<{
    id: string;
    grossAmount: number;
    commissionRate: number;
    commissionAmount: number;
    netAmount: number;
    status: string;
    createdAt: string;
    order?: { orderNo: string; title: string };
  }>;
  recentWithdrawals: TeacherWithdrawal[];
}

export type RequestStatus = 'PENDING_REVIEW' | 'OPEN' | 'TEACHER_SELECTED' | 'CLOSED' | 'REJECTED';

export interface ExplainRequest {
  id: string;
  requestNo?: number;
  studentId: string;
  universityId?: string | null;
  collegeId?: string | null;
  majorId?: string | null;
  courseTitle: string;
  details?: string | null;
  type: 'ONLINE' | 'IN_PERSON' | 'BOTH';
  urgency: 'NOW' | 'DAY' | 'WEEK' | 'TERM';
  budget?: number | null;
  deadline?: string | null;
  attachments?: { url: string; name?: string }[] | null;
  linkUrl?: string | null;
  status: RequestStatus;
  createdAt: string;
  university?: University | null;
  college?: { name: string } | null;
  major?: { name: string } | null;
  student?: Pick<User, 'id' | 'fullName' | 'username' | 'whatsapp'>;
  offersCount?: number;
  offers?: Offer[];
  /** true عندما تكون بيانات الطلب محدودة لأن المستخدم ليس مالكه ولا مدرّسًا معتمدًا */
  restricted?: boolean;
  myOfferId?: string | null;
}

export interface Offer {
  id: string;
  requestId: string;
  teacherId: string;
  price: number;
  message?: string | null;
  timelineDays?: number | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  teacher?: User & { teacherProfile?: TeacherProfile | null };
  createdAt?: string;
}

export type OrderStatus = 'AWAITING_PAYMENT' | 'AWAITING_REVIEW' | 'REJECTED' | 'PAID' | 'CANCELLED';

export interface Order {
  id: string;
  orderNo?: number | string;
  studentId: string;
  targetType: 'OFFERING' | 'SERVICE' | 'OFFER' | 'CUSTOM';
  targetId?: string | null;
  amount: number;
  title?: string | null;
  status: OrderStatus;
  notes?: string | null;
  createdAt: string;
  payment?: Payment | null;
  student?: Pick<User, 'id' | 'fullName' | 'username' | 'whatsapp'>;
}

export interface Payment {
  id: string;
  orderId?: string;
  method?: 'TRANSFER' | 'GATEWAY';
  receiptUrl?: string | null;
  status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewNote?: string | null;
  paidAt?: string | null;
  order?: Order;
}

export interface ChatRoom {
  id: string;
  type: 'DIRECT' | 'GROUP' | 'ORDER';
  title?: string | null;
  ownerId?: string | null;
  unreadCount?: number;
  unread?: number;
  isSupport?: boolean;
  participants?: User[];
  lastMessage?: { body: string | null; createdAt?: string; at?: string; sender?: string; senderId?: string } | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  body?: string | null;
  attachmentUrl?: string | null;
  createdAt: string;
  sender?: Pick<User, 'id' | 'fullName'>;
}

export interface Ad {
  id: string;
  teacherId: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'HIDDEN' | 'EXPIRED';
  reviewerNote?: string | null;
  createdAt?: string;
  teacher?: Pick<User, 'id' | 'fullName' | 'username'>;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body?: string | null;
  link?: string | null;
  isRead: boolean;
  type?: string | null;
  createdAt: string;
}

export interface AuditLogRow {
  id: string;
  userId?: string | null;
  actorRole?: string | null;
  action: string;
  category: string;
  result: 'SUCCESS' | 'FAILURE';
  reason?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  createdAt: string;
  user?: { id: string; fullName: string; username: string; role: Role } | null;
}

export interface LiveSession {
  id: string;
  offeringId?: string | null;
  teacherId: string;
  title: string;
  startsAt: string;
  durationMin?: number;
  price?: number | null;
  capacity?: number | null;
  teacher?: Pick<User, 'id' | 'fullName' | 'username'>;
  offering?: Offering | null;
  bookingsCount?: number;
  myBooking?: { id: string; status: string } | null;
}

export interface PlatformPublic {
  name?: string;
  telegramLink?: string | null;
  telegram_link?: string | null;
  whatsappNumbers?: string | string[] | null;
  whatsapp_numbers?: string | string[] | null;
  paymentInstructions?: string | null;
  payment_instructions_preview?: string | null;
  iban?: string | null;
  bankName?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  faq?: any;
  oauth?: {
    googleEnabled: boolean;
    googleClientId: string;
  };
}

export type OAuthGoogleResponse = {
  status: 'LOGGED_IN' | 'ACCOUNT_EXISTS' | 'NEEDS_COMPLETION';
  user?: User;
  session?: { id: string };
  email?: string;
  registrationTicket?: string;
  fullName?: string;
  avatarUrl?: string | null;
};

export type CompleteOAuthInput = {
  registrationTicket: string;
  fullName: string;
  username: string;
  password?: string;
  confirmPassword?: string;
  role: 'STUDENT' | 'TEACHER';
  degree?: string;
  bio?: string;
  specialties?: string[];
  universitiesText?: string;
  docsUrl?: string;
};

export interface MfaPendingResponse {
  requireMfa: true;
  mfaTicket: string;
  message: string;
}

export type LoginResponseData = User | MfaPendingResponse;

export interface SecurityOverviewData {
  status: {
    emergencyMode: boolean;
    recaptcha: { enabled: boolean; mode: string; minScore: number };
    redis: { connected: boolean; fallbackMode: boolean; reconnectAttempts: number };
    cloudflare: { detected: boolean; cfRay: string | null };
    rateLimitEnabled: boolean;
    autoBanEnabled: boolean;
  };
  metrics: {
    totalRequests: number;
    blockedRateLimit: number;
    blockedIpBans: number;
    failedLogins: number;
    failedCaptchas: number;
    activeIncidents: number;
    activeBans: number;
  };
  recentIncidents: SecurityIncidentItem[];
}

export interface BlockedIpItem {
  id: string;
  ip: string;
  reason: string;
  bannedAt: string;
  expiresAt?: string | null;
  bannedBy?: string | null;
  permanent: boolean;
}

export interface SecurityIncidentItem {
  id: string;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ip: string;
  userId?: string | null;
  endpoint?: string | null;
  details?: Record<string, unknown> | null;
  resolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
}

export interface SecuritySettingsData {
  emergencyMode: boolean;
  rateLimitEnabled: boolean;
  recaptchaEnabled: boolean;
  recaptchaMinScore: number;
  recaptchaMode: 'v2' | 'v3' | 'enterprise' | 'simulated';
  autoBanEnabled: boolean;
  banDurationMinutes: number;
  failedLoginThreshold: number;
}

/* ===================== نقاط الاتصال ===================== */

export const api = {
  auth: {
    captchaConfig: () => request<{ enabled: boolean; siteKey: string; mode: string }>('/auth/captcha-config'),
    registerStudent: (body: Record<string, unknown>, captchaToken?: string | null) => {
      const headers: Record<string, string> = {};
      if (captchaToken) headers['x-captcha-token'] = captchaToken;
      return request<{ message?: string }>('/auth/register/student', {
        method: 'POST',
        body: captchaToken ? { ...body, captchaToken } : body,
        headers,
      });
    },
    registerTeacher: (body: Record<string, unknown>, captchaToken?: string | null) => {
      const headers: Record<string, string> = {};
      if (captchaToken) headers['x-captcha-token'] = captchaToken;
      return request<{ message?: string }>('/auth/register/teacher', {
        method: 'POST',
        body: captchaToken ? { ...body, captchaToken } : body,
        headers,
      });
    },
    // الخادم يغلّف المستخدم داخل { user }؛ نُعيد هنا كائن المستخدم أو تذكرة MFA إن كانت مفعلة
    login: async (identifier: string, password: string, captchaToken?: string | null) => {
      const headers: Record<string, string> = {};
      if (captchaToken) headers['x-captcha-token'] = captchaToken;
      const res = await request<User | { user?: User; requireMfa?: boolean; mfaTicket?: string; message?: string }>('/auth/login', {
        method: 'POST',
        body: { identifier, password, ...(captchaToken ? { captchaToken } : {}) },
        headers,
      });
      const payload = res.data as { user?: User; requireMfa?: boolean; mfaTicket?: string; message?: string } | User | null;
      if (payload && 'requireMfa' in payload && payload.requireMfa) {
        return {
          ...res,
          data: payload as MfaPendingResponse,
        };
      }
      return {
        ...res,
        data: (payload && 'user' in payload ? payload.user : payload) as User,
      };
    },
    google: (idToken: string) =>
      request<OAuthGoogleResponse>('/auth/google', {
        method: 'POST',
        body: { idToken },
      }),
    completeOAuth: (body: CompleteOAuthInput) =>
      request<{
        user: User;
        session?: { id: string };
        status: 'ACTIVE' | 'PENDING';
      }>('/auth/register/complete-oauth', {
        method: 'POST',
        body,
      }),
    mfa: {
      verify: (body: { mfaTicket: string; code: string }) =>
        request<{ user: User; message: string }>('/auth/mfa/verify', { method: 'POST', body }),
      setup: () =>
        request<{ secret: string; otpauthUri: string; issuer: string; account: string }>('/auth/mfa/setup', { method: 'POST' }),
      enable: (body: { secret: string; code: string }) =>
        request<{ enabled: boolean; backupCodes: string[]; message: string }>('/auth/mfa/enable', { method: 'POST', body }),
      disable: (body: { password: string; code?: string }) =>
        request<{ message: string }>('/auth/mfa/disable', { method: 'POST', body }),
    },
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: async () => {
      const res = await request<User | { user: User }>('/auth/me');
      const payload = res.data as { user?: User } | User | null;
      return { ...res, data: (payload && 'user' in payload ? payload.user : payload) as User };
    },
    verifyEmail: (token: string) =>
      request<{ emailVerified?: boolean; message?: string }>('/auth/verify-email', { method: 'POST', body: { token } }),
    resendVerification: () => request('/auth/resend-verification', { method: 'POST' }),
    /** توثيق البريد المسجّل الحالي بزر واحد (لا بريد بديل ولا رمز يدوي) */
    requestEmailVerification: () =>
      request<{ emailVerified?: boolean; message?: string }>('/auth/email/verify-request', { method: 'POST' }),
    /** فحص توفّر اسم المستخدم مباشرة أثناء الكتابة */
    usernameAvailability: (username: string) =>
      request<{ username: string; valid: boolean; available: boolean; reason: string | null }>(
        '/auth/username-availability',
        { query: { username } },
      ),
    forgotPassword: (email: string, captchaToken?: string | null) => {
      const headers: Record<string, string> = {};
      if (captchaToken) headers['x-captcha-token'] = captchaToken;
      return request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email, ...(captchaToken ? { captchaToken } : {}) },
        headers,
      });
    },
    resetPassword: (body: { token: string; password: string; confirmPassword: string }) =>
      request<{ message: string }>('/auth/reset-password', { method: 'POST', body }),
    confirmEmailChange: (token: string) =>
      request<{ message: string }>('/auth/email-change/confirm', { method: 'POST', body: { token } }),
  },

  account: {
    me: () => request<MyProfile>('/users/me'),
    updateProfile: (body: { fullName?: string; whatsapp?: string | null; universityId?: string | null; majorId?: string | null; level?: string | null }) =>
      request<User>('/users/me', { method: 'PATCH', body }),
    updateUsername: (username: string) =>
      request<{ username: string }>('/users/me/username', { method: 'PATCH', body: { username } }),
    requestEmailChange: (body: { newEmail: string; currentPassword: string }) =>
      request<{ pendingEmail: string; message: string }>('/users/me/email', { method: 'PATCH', body }),
    changePassword: (body: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
      request<{ message: string }>('/users/me/password', { method: 'POST', body }),
    uploadAvatar: (file: File) => {
      const fd = new FormData();
      fd.append('avatar', file);
      return request<{ avatarUrl: string }>('/users/me/avatar', { method: 'POST', formData: fd });
    },
    removeAvatar: () => request<{ avatarUrl: null }>('/users/me/avatar', { method: 'DELETE' }),
    sessions: () => request<AccountSession[]>('/users/me/sessions'),
    revokeSession: (id: string) => request<{ message: string }>(`/users/me/sessions/${id}`, { method: 'DELETE' }),
    logoutAll: () => request<{ message: string }>('/users/me/sessions/logout-all', { method: 'POST' }),
  },

  platform: {
    public: () => request<PlatformPublic>('/platform/public'),
  },

  universities: {
    list: (q?: string) => request<University[]>('/universities', { query: { q } }),
    get: (slug: string) => request<Record<string, unknown>>(`/universities/${slug}`),
  },
  colleges: {
    list: (universityId?: string) => request<College[]>('/colleges', { query: { universityId } }),
  },
  majors: {
    list: (universityId?: string, collegeId?: string) => request<Major[]>('/majors', { query: { universityId, collegeId } }),
  },
  courses: {
    list: (query: Record<string, string | number | undefined>) => request<Course[]>('/courses', { query }),
    get: (id: string) => request<Record<string, unknown>>(`/courses/${id}`),
  },
  teachers: {
    list: (query: Record<string, string | number | undefined>) => request<unknown[]>('/teachers', { query }),
    get: (username: string) => request<Record<string, unknown>>(`/teachers/${username}`),
  },
  services: {
    list: (query?: { category?: string; q?: string }) => request<Service[]>('/services', { query }),
    get: (slug: string) => request<Service>(`/services/${slug}`),
  },
  serviceOrders: {
    create: async (body: { slug?: string; serviceId?: string; note?: string; notes?: string; providerId?: string }) => {
      const res = await request<{ order?: Order } & Order>('/service-orders', {
        method: 'POST',
        body: { slug: body.slug, notes: body.notes ?? body.note, providerId: body.providerId },
      });
      const order = (res.data?.order ?? res.data) as Order;
      return { data: order, meta: res.meta };
    },
  },

  requests: {
    list: (query: Record<string, string | number | undefined>) => request<ExplainRequest[]>('/requests', { query }),
    get: (id: string) => request<ExplainRequest>(`/requests/${id}`),
    create: (body: Record<string, unknown>) => request<ExplainRequest>('/requests', { method: 'POST', body }),
    offers: (id: string) => request<Offer[]>(`/requests/${id}/offers`),
    createOffer: (id: string, body: { price: number; message?: string; timelineDays?: number }) => request<Offer>(`/requests/${id}/offers`, { method: 'POST', body }),
    acceptOffer: async (offerId: string) => {
      const res = await request<{ order?: Order } & Order>(`/offers/${offerId}/accept`, { method: 'POST' });
      const order = (res.data?.order ?? res.data) as Order;
      return { data: order, meta: res.meta };
    },
    close: (id: string) => request(`/requests/${id}/close`, { method: 'POST' }),
  },

  offerings: {
    create: (body: Record<string, unknown>) => request<Offering>('/offerings', { method: 'POST', body }),
    submit: (id: string) => request<Offering>(`/offerings/${id}/submit`, { method: 'POST' }),
    update: (id: string, body: Record<string, unknown>) => request<Offering>(`/offerings/${id}`, { method: 'PATCH', body }),
    enroll: async (id: string) => {
      const res = await request<{ order?: Order } & Order>(`/offerings/${id}/enroll`, { method: 'POST' });
      const order = (res.data?.order ?? res.data) as Order;
      return { data: order, meta: res.meta };
    },
    attendees: (id: string) => request<unknown[]>(`/offerings/${id}/attendees`),
    addLesson: (id: string, body: { title: string; videoUrl: string; access?: 'TRIAL' | 'PAID'; order?: number }) =>
      request<Lesson>(`/offerings/${id}/lessons`, { method: 'POST', body }),
  },

  liveSessions: {
    list: (query?: Record<string, string | number | undefined>) => request<LiveSession[]>('/live-sessions', { query }),
    mine: () => request<LiveSession[]>('/live-sessions/mine'),
    create: (body: Record<string, unknown>) => request<LiveSession>('/live-sessions', { method: 'POST', body }),
    book: (id: string) => request<{ orderId?: string; booking?: unknown }>(`/live-sessions/${id}/book`, { method: 'POST' }),
  },

  teacher: {
    earnings: () =>
      request<{
        gross?: number;
        commissionRate?: number;
        dues?: number;
        breakdown?: Record<string, unknown>[];
        total?: number;
        commission?: number;
        net?: number;
        rows?: Record<string, unknown>[];
      }>('/teacher/earnings'),
  },

  orders: {
    list: (query?: Record<string, string | number | undefined>) => request<Order[]>('/orders', { query }),
    get: async (id: string) => {
      const res = await request<{ order?: Order; paymentInfo?: unknown } & Order>(`/orders/${id}`);
      const order = (res.data?.order ?? res.data) as Order;
      return { data: order, meta: res.meta };
    },
    receipt: (id: string, file: File) => {
      const fd = new FormData();
      fd.append('receipt', file);
      return request<Payment>(`/orders/${id}/receipt`, { method: 'POST', formData: fd });
    },
  },

  chat: {
    rooms: () => request<ChatRoom[]>('/chat/rooms'),
    createRoom: (body: { peerId?: string; type?: 'GROUP'; title?: string }) => request<ChatRoom>('/chat/rooms', { method: 'POST', body }),
    messages: (roomId: string, before?: string) => request<ChatMessage[]>(`/chat/rooms/${roomId}/messages`, { query: { before } }),
    send: (roomId: string, body: { body?: string; attachmentUrl?: string }) => request<ChatMessage>(`/chat/rooms/${roomId}/messages`, { method: 'POST', body }),
    read: (roomId: string) => request(`/chat/rooms/${roomId}/read`, { method: 'POST' }),
  },

  ads: {
    list: (mine?: boolean, status?: string) => request<Ad[]>('/ads', { query: { mine: mine ? 'true' : undefined, status } }),
    create: (body: Record<string, unknown>) => request<Ad>('/ads', { method: 'POST', body }),
    submit: (id: string) => request<Ad>(`/ads/${id}/submit`, { method: 'POST' }),
    update: (id: string, body: Record<string, unknown>) => request<Ad>(`/ads/${id}`, { method: 'PATCH', body }),
  },

  uploads: {
    create: (file: File, field = 'file') => {
      const fd = new FormData();
      fd.append(field, file);
      return request<{ url: string }>('/uploads', { method: 'POST', formData: fd });
    },
  },

  notifications: {
    list: () => request<Notification[]>('/notifications'),
    read: (id: string) => request(`/notifications/${id}/read`, { method: 'POST' }),
    readAll: () => request('/notifications/read-all', { method: 'POST' }),
  },

  favorites: {
    list: () => request<{ id: string; targetId: string; targetType: 'SERVICE' | 'OFFERING' | 'TEACHER' }[]>('/favorites'),
    toggle: (targetId: string, targetType: 'SERVICE' | 'OFFERING' | 'TEACHER') =>
      request<{ favorited: boolean }>(`/favorites/${targetId}/toggle`, { method: 'POST', body: { targetType } }),
  },

  customRequests: {
    create: (body: {
      requestType: CustomRequestType;
      title: string;
      description: string;
      universityName?: string;
      majorName?: string;
      academicLevel?: string;
      deadline?: string;
      budget?: number;
      attachments?: Array<{ name: string; url: string; size?: number; type?: string }>;
    }) => request<CustomServiceRequest>('/custom-requests', { method: 'POST', body }),
    mine: (query?: Record<string, string | number | undefined>) =>
      request<CustomServiceRequest[]>('/custom-requests/mine', { query }),
    get: (id: string) => request<CustomServiceRequest>(`/custom-requests/${id}`),
  },

  admin: {
    stats: () => request<Record<string, unknown>>('/admin/stats'),
    customRequests: {
      list: (query?: Record<string, string | number | undefined>) =>
        request<CustomServiceRequest[]>('/admin/custom-requests', { query }),
      get: (id: string) => request<CustomServiceRequest>(`/admin/custom-requests/${id}`),
      updateStatus: (
        id: string,
        body: { status: CustomRequestStatus; adminNotes?: string; notifyUser?: boolean },
      ) => request<{ data: CustomServiceRequest; message: string }>(`/admin/custom-requests/${id}`, { method: 'PATCH', body }),
      resendEmail: (id: string) =>
        request<{ message: string; data: CustomServiceRequest }>(`/admin/custom-requests/${id}/resend-email`, {
          method: 'POST',
        }),
    },
    crud: <T>(resource: string) => ({
      list: (query?: Record<string, string | number | undefined>) => request<T[]>(`/admin/${resource}`, { query }),
      create: (body: Record<string, unknown>) => request<T>(`/admin/${resource}`, { method: 'POST', body }),
      update: (id: string, body: Record<string, unknown>) => request<T>(`/admin/${resource}/${id}`, { method: 'PATCH', body }),
      remove: (id: string) => request(`/admin/${resource}/${id}`, { method: 'DELETE' }),
    }),
    usersExportExcel: async () => {
      const res = await fetch(`${API_BASE}/admin/users/export/excel/download`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) throw new ApiError(res.status, msg('errors.generic'));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      return { success: true };
    },
    special: {
      teachers: () => request<Record<string, unknown>[]>('/admin/teachers'),
      teacherApprove: (id: string) => request(`/admin/teachers/${id}/approve`, { method: 'POST' }),
      teacherReject: (id: string) => request(`/admin/teachers/${id}/reject`, { method: 'POST' }),
      teacherDisable: (id: string) => request(`/admin/teachers/${id}/disable`, { method: 'POST' }),
      teacherEnable: (id: string) => request(`/admin/teachers/${id}/enable`, { method: 'POST' }),
      requestPublish: (id: string) => request(`/requests/${id}/publish`, { method: 'POST' }),
      requestReject: (id: string, reason?: string) => request(`/requests/${id}/reject`, { method: 'POST', body: { reason } }),
      paymentReview: (paymentId: string, body: { decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
        request(`/payments/${paymentId}/review`, { method: 'POST', body }),
      adDecision: (id: string, body: { decision: string; note?: string }) => request(`/ads/${id}/admin`, { method: 'POST', body }),
      settings: () =>
        request<Record<string, string>>('/admin/settings'),
      settingsPut: (body: Record<string, string>) => request('/admin/settings', { method: 'PUT', body }),
      broadcast: (body: { role?: string; title: string; body?: string; link?: string }) => request('/admin/notifications/broadcast', { method: 'POST', body }),
      reports: () => request<unknown[]>('/admin/chat/reports'),
      auditLogs: (query?: Record<string, string | number | undefined>) =>
        request<AuditLogRow[]>('/admin/audit-logs', { query }),
    },
    security: {
      overview: () => request<SecurityOverviewData>('/admin/security/overview'),
      bans: () => request<BlockedIpItem[]>('/admin/security/bans'),
      banIp: (body: { ip: string; reason: string; durationMinutes?: number }) =>
        request<{ message: string }>('/admin/security/bans', { method: 'POST', body }),
      unbanIp: (ip: string) =>
        request<{ message: string }>(`/admin/security/bans/${encodeURIComponent(ip)}`, { method: 'DELETE' }),
      settings: () => request<SecuritySettingsData>('/admin/security/settings'),
      updateSettings: (body: Partial<SecuritySettingsData>) =>
        request<{ message: string }>('/admin/security/settings', { method: 'PATCH', body }),
      toggleEmergency: (body: { enabled: boolean; reason?: string }) =>
        request<{ message: string }>('/admin/security/emergency', { method: 'POST', body }),
      incidents: (query?: { severity?: string; eventType?: string }) =>
        request<SecurityIncidentItem[]>('/admin/security/incidents', { query }),
      resolveIncident: (id: string) =>
        request<{ message: string }>(`/admin/security/incidents/${id}/resolve`, { method: 'POST' }),
    },
    users: {
      stats: () => request<UserManagementStats>('/admin/users/stats'),
      list: (query?: { q?: string; role?: string; status?: string; filter?: string; page?: number; limit?: number }) =>
        request<{ items: AdminUserListItem[]; total: number; page: number; totalPages: number }>('/admin/users', { query }),
      recoveries: (query?: { status?: string; page?: number; limit?: number }) =>
        request<{ items: AdminRecoveryItem[]; total: number; page: number; totalPages: number }>('/admin/users/recoveries', { query }),
      get: (id: string) => request<{ user: AdminUserDetail }>(`/admin/users/${id}`),
      updateProfile: (id: string, body: { fullName?: string; whatsapp?: string; level?: string; bio?: string }) =>
        request<any>(`/admin/users/${id}/profile`, { method: 'PATCH', body }),
      changeUsername: (id: string, body: { username: string }) =>
        request<any>(`/admin/users/${id}/username`, { method: 'PATCH', body }),
      changeEmail: (id: string, body: { email: string; reason: string }) =>
        request<any>(`/admin/users/${id}/email`, { method: 'PATCH', body }),
      suspend: (id: string, body: { reason: string }) =>
        request<any>(`/admin/users/${id}/suspend`, { method: 'POST', body }),
      reactivate: (id: string) =>
        request<any>(`/admin/users/${id}/reactivate`, { method: 'POST' }),
      revokeSessions: (id: string) =>
        request<any>(`/admin/users/${id}/revoke-sessions`, { method: 'POST' }),
      sendRecoveryEmail: (id: string) =>
        request<any>(`/admin/users/${id}/send-recovery-email`, { method: 'POST' }),
      createAlternativeRecovery: (id: string, body: { alternativeEmail: string; reason: string; verificationMethod: string; verificationNotes?: string; evidenceRef?: string }) =>
        request<any>(`/admin/users/${id}/alternative-recovery`, { method: 'POST', body }),
      reviewRecovery: (id: string, body: { decision: 'APPROVED' | 'REJECTED'; notes?: string }) =>
        request<any>(`/admin/users/recoveries/${id}/review`, { method: 'POST', body }),
      changeRole: (id: string, body: { role: string; confirm: boolean }) =>
        request<any>(`/admin/users/${id}/role`, { method: 'POST', body }),
    },
  },
  refunds: {
    eligible: () => request<Array<{ id: string; orderNo: string; title: string; amount: number; targetType: string; maxRefundable: number; alreadyRefunded: number; paidAt: string }>>('/refunds/eligible'),
    check: (orderId: string) => request<{ isEligible: boolean; reason?: string; maxRefundable: number; totalPaid: number; alreadyRefunded: number }>(`/refunds/check/${orderId}`),
    submit: (body: { orderId: string; amountRequested: number; reason: string; notes?: string; attachments?: string[]; bankName?: string; iban?: string; accountHolderName?: string }) =>
      request<RefundRequest>('/refunds', { method: 'POST', body }),
    mine: () => request<RefundRequest[]>('/refunds/mine'),
    cancel: (id: string) => request<RefundRequest>(`/refunds/${id}/cancel`, { method: 'PATCH' }),
    adminList: (query?: { status?: string; page?: number; limit?: number }) => request<RefundRequest[]>('/refunds/admin/all', { query }),
    adminReview: (id: string, body: { decision: 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | 'NEEDS_INFORMATION'; amountApproved?: number; adminNotes?: string; rejectionReason?: string }) =>
      request<RefundRequest>(`/refunds/admin/${id}/review`, { method: 'PATCH', body }),
    adminExecute: (id: string, body: { transferProofUrl: string; transferReferenceNo: string; transferredAt?: string; adminNotes?: string }) =>
      request<RefundRequest>(`/refunds/admin/${id}/execute`, { method: 'POST', body }),
  },
  withdrawals: {
    wallet: () => request<TeacherWalletSummary>('/withdrawals/teacher/wallet'),
    payoutMethods: () => request<TeacherPayoutMethod[]>('/withdrawals/teacher/payout-methods'),
    addPayoutMethod: (body: { bankName: string; accountHolderName: string; iban: string; isDefault?: boolean }) =>
      request<TeacherPayoutMethod>('/withdrawals/teacher/payout-methods', { method: 'POST', body }),
    withdraw: (body: { amount: number; payoutMethodId: string; adminNotes?: string }) =>
      request<TeacherWithdrawal>('/withdrawals/teacher/withdraw', { method: 'POST', body }),
    history: () => request<TeacherWithdrawal[]>('/withdrawals/teacher/history'),
    adminList: (query?: { status?: string; page?: number; limit?: number }) => request<TeacherWithdrawal[]>('/withdrawals/admin/all', { query }),
    adminReview: (id: string, body: { decision: 'APPROVED' | 'REJECTED'; adminNotes?: string; rejectionReason?: string }) =>
      request<TeacherWithdrawal>(`/withdrawals/admin/${id}/review`, { method: 'PATCH', body }),
    adminExecute: (id: string, body: { transferProofUrl: string; transferReferenceNo: string; transferredAt?: string; adminNotes?: string }) =>
      request<TeacherWithdrawal>(`/withdrawals/admin/${id}/execute`, { method: 'POST', body }),
  },
  recovery: {
    checkToken: (token: string) => request<RecoveryTokenInfo>('/auth/recovery/verify', { query: { token } }),
    complete: (body: { token: string; password: string }) => request<{ success: boolean; message: string }>('/auth/recovery/verify', { method: 'POST', body }),
  },
};

export interface UserManagementStats {
  totalUsers: number;
  studentsCount: number;
  teachersCount: number;
  adminsCount: number;
  activeCount: number;
  suspendedCount: number;
  unverifiedCount: number;
  pendingRecoveriesCount: number;
}

export interface AdminUserListItem {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  emailVerified: boolean;
  emailVerifiedAt?: string | null;
  whatsapp?: string | null;
  level?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  activeSessionsCount: number;
  recoveryRequestsCount: number;
  teacherProfile?: { id: string; degree: string; status: string } | null;
}

export interface AdminRecoveryItem {
  id: string;
  recoveryNo: string;
  userId: string;
  originalEmail: string;
  alternativeEmail: string;
  reason: string;
  verificationMethod: string;
  verificationNotes?: string | null;
  evidenceRef?: string | null;
  isHighRisk: boolean;
  approvalRequired: boolean;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'VERIFICATION_SENT' | 'COMPLETED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  tokenExpiresAt?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  completedAt?: string | null;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    username: string;
    email: string;
    role: string;
    status: string;
  };
  initiator: { id: string; fullName: string; username: string; email: string };
  reviewer?: { id: string; fullName: string; username: string; email: string } | null;
  approvals?: Array<{
    id: string;
    adminId: string;
    decision: string;
    notes?: string | null;
    createdAt: string;
    admin: { id: string; fullName: string; username: string };
  }>;
}

export interface AdminUserDetail {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  emailVerified: boolean;
  emailVerifiedAt?: string | null;
  whatsapp?: string | null;
  level?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  sessionVersion: number;
  adminPermissions: string[];
  university?: { id: string; name: string } | null;
  major?: { id: string; name: string } | null;
  teacherProfile?: {
    id: string;
    degree: string;
    bio: string;
    status: string;
    offerings?: Array<{ id: string; title: string; status: string; price: number }>;
    services?: Array<{ id: string; title: string; isActive: boolean; basePrice?: number | null }>;
  } | null;
  sessions: Array<{
    id: string;
    ip?: string | null;
    userAgent?: string | null;
    createdAt: string;
    lastSeenAt: string;
    endedAt?: string | null;
    endReason?: string | null;
  }>;
  recoveries: AdminRecoveryItem[];
  risk: { isHighRisk: boolean; reasons: string[] };
  auditLogs: Array<{
    id: string;
    action: string;
    category: string;
    result: string;
    createdAt: string;
    ip?: string | null;
    reason?: string | null;
    oldValues?: any;
    newValues?: any;
  }>;
}

export interface RecoveryTokenInfo {
  valid: boolean;
  recoveryNo: string;
  userFullName: string;
  username: string;
  maskedOriginalEmail: string;
  maskedAlternativeEmail: string;
  expiresAt: string;
}

