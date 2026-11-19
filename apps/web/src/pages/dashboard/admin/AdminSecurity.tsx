import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type BlockedIpItem,
  type SecurityIncidentItem,
  type SecurityOverviewData,
  type SecuritySettingsData,
} from '../../../lib/api';
import { Badge, Button, Card, EmptyState, Field, Form, Input, Skeleton } from '../../../components/ui';
import { formatDateTime } from '../../../lib/format';
import { useToast } from '../../../lib/toast';
import {
  IconSecurity,
  IconRefresh,
  IconEmergency,
  IconAlert,
  IconSettings,
  IconProhibited,
  IconIncident,
  IconCheck,
} from '../../../components/icons';

export default function AdminSecurity() {
  const toast = useToast();

  const [overview, setOverview] = useState<SecurityOverviewData | null>(null);
  const [bans, setBans] = useState<BlockedIpItem[]>([]);
  const [incidents, setIncidents] = useState<SecurityIncidentItem[]>([]);
  const [settings, setSettings] = useState<SecuritySettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [banningIp, setBanningIp] = useState(false);
  const [emergencyBusy, setEmergencyBusy] = useState(false);

  // نموذج الحظر اليدوي
  const [newIp, setNewIp] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newDuration, setNewDuration] = useState('60');

  // استدعاء البيانات
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, bansRes, incRes, setRes] = await Promise.all([
        api.admin.security.overview(),
        api.admin.security.bans(),
        api.admin.security.incidents(),
        api.admin.security.settings(),
      ]);
      setOverview(ovRes.data);
      setBans(bansRes.data ?? []);
      setIncidents(incRes.data ?? []);
      setSettings(setRes.data);
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : 'تعذر تحميل بيانات مركز الأمان');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // تبديل وضع الطوارئ
  const handleToggleEmergency = async () => {
    if (!overview) return;
    const nextState = !overview.status.emergencyMode;
    const confirmMsg = nextState
      ? 'هل أنت متأكد من تفعيل وضع الطوارئ (Emergency Lockdown)؟ سيتم خفض حدود الطلبات للنصف وتطبيق أقصى درجات التدقيق الأمني.'
      : 'هل تريد إلغاء وضع الطوارئ والعودة إلى معدلات التشغيل الطبيعية؟';

    if (!window.confirm(confirmMsg)) return;

    setEmergencyBusy(true);
    try {
      const res = await api.admin.security.toggleEmergency({
        enabled: nextState,
        reason: nextState ? 'تفعيل يدوي من لوحة الإدارة' : 'إلغاء يدوي من لوحة الإدارة',
      });
      toast.push('success', res.data.message);
      await loadData();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : 'فشل تغيير وضع الطوارئ');
    } finally {
      setEmergencyBusy(false);
    }
  };

  // حفظ إعدادات الأمان
  const handleSaveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const res = await api.admin.security.updateSettings({
        rateLimitEnabled: settings.rateLimitEnabled,
        recaptchaMinScore: settings.recaptchaMinScore,
        autoBanEnabled: settings.autoBanEnabled,
        banDurationMinutes: settings.banDurationMinutes,
      });
      toast.push('success', res.data.message || 'تم حفظ إعدادات الأمان بنجاح');
      await loadData();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : 'فشل حفظ الإعدادات');
    } finally {
      setSavingSettings(false);
    }
  };

  // حظر IP يدويًا
  const handleBanIp = async () => {
    if (!newIp.trim() || !newReason.trim()) {
      toast.push('error', 'يرجى إدخال عنوان IP وسبب الحظر.');
      return;
    }
    setBanningIp(true);
    try {
      const res = await api.admin.security.banIp({
        ip: newIp.trim(),
        reason: newReason.trim(),
        durationMinutes: parseInt(newDuration, 10) || 60,
      });
      toast.push('success', res.data.message);
      setNewIp('');
      setNewReason('');
      await loadData();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : 'تعذر حظر العنوان');
    } finally {
      setBanningIp(false);
    }
  };

  // رفع الحظر عن IP
  const handleUnban = async (ip: string) => {
    if (!window.confirm(`هل أنت متأكد من رفع الحظر عن العنوان ${ip}؟`)) return;
    try {
      const res = await api.admin.security.unbanIp(ip);
      toast.push('success', res.data.message);
      await loadData();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : 'تعذر رفع الحظر');
    }
  };

  // تعليم حادث كمعالج
  const handleResolveIncident = async (id: string) => {
    try {
      const res = await api.admin.security.resolveIncident(id);
      toast.push('success', res.data.message);
      await loadData();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : 'تعذر تحديث الحادث');
    }
  };

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const isEmergency = overview?.status.emergencyMode ?? false;

  return (
    <div className="space-y-6">
      {/* رأس الصفحة وأزرار التحكم */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-primary">
            <IconSecurity className="size-7 text-gold-300" />
            <span>مركز الأمن والحماية (Security Center)</span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            مراقبة التهديدات، صد الهجمات، إدارة الحظر التلقائي، ومحدد الطلبات المتطور.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="subtle" size="sm" onClick={() => void loadData()} className="inline-flex items-center gap-1.5">
            <IconRefresh className="size-4" />
            <span>تحديث البيانات</span>
          </Button>
          <Button
            variant={isEmergency ? 'danger' : 'primary'}
            size="sm"
            loading={emergencyBusy}
            onClick={handleToggleEmergency}
            className="inline-flex items-center gap-1.5"
          >
            {isEmergency ? (
              <>
                <IconEmergency className="size-4" />
                <span>إيقاف وضع الطوارئ</span>
              </>
            ) : (
              <>
                <IconAlert className="size-4" />
                <span>تفعيل وضع الطوارئ</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* شريط وضع الطوارئ عند التفعيل */}
      {isEmergency && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/60 bg-danger/15 p-4 text-coral animate-pulse">
          <div className="flex items-center gap-3">
            <IconAlert className="size-7 shrink-0 text-coral" />
            <div>
              <p className="font-bold">وضع الطوارئ والحماية المشددة نشط حاليًا (Emergency Mode)</p>
              <p className="text-xs text-ink-secondary">
                محدد معدل الطلبات مخفّض للنصف على جميع المسارات، وتدقيق reCAPTCHA مفروض بصرامة.
              </p>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={handleToggleEmergency} loading={emergencyBusy}>
            استعادة الوضع الطبيعي
          </Button>
        </div>
      )}

      {/* شارات الحالة الأمنية */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="flex items-center justify-between p-3">
          <div>
            <p className="text-xs text-ink-muted">Google reCAPTCHA</p>
            <p className="font-semibold text-ink-primary">
              {overview?.status?.recaptcha?.mode ? overview.status.recaptcha.mode.toUpperCase() : 'SIMULATED'}
            </p>
          </div>
          <Badge tone={overview?.status?.recaptcha?.enabled ? 'ok' : 'muted'}>
            {overview?.status?.recaptcha?.enabled ? 'نشط' : 'محاكاة'}
          </Badge>
        </Card>

        <Card className="flex items-center justify-between p-3">
          <div>
            <p className="text-xs text-ink-muted">الذاكرة المشتركة (Redis)</p>
            <p className="font-semibold text-ink-primary">
              {overview?.status?.redis?.fallbackMode ? 'Memory Fallback' : 'Connected'}
            </p>
          </div>
          <Badge tone={overview?.status?.redis?.fallbackMode ? 'warn' : 'ok'}>
            {overview?.status?.redis?.fallbackMode ? 'محلي' : 'مشترك'}
          </Badge>
        </Card>

        <Card className="flex items-center justify-between p-3">
          <div>
            <p className="text-xs text-ink-muted">حماية الحافة (Cloudflare)</p>
            <p className="font-semibold text-ink-primary">
              {overview?.status?.cloudflare?.detected ? 'Behind WAF' : 'Direct / Local'}
            </p>
          </div>
          <Badge tone={overview?.status?.cloudflare?.detected ? 'ok' : 'muted'}>
            {overview?.status?.cloudflare?.detected ? 'WAF نشط' : 'مباشر'}
          </Badge>
        </Card>

        <Card className="flex items-center justify-between p-3">
          <div>
            <p className="text-xs text-ink-muted">محدد الطلبات (Rate Limit)</p>
            <p className="font-semibold text-ink-primary">
              {overview?.status?.rateLimitEnabled ? 'Sliding Window' : 'معطّل'}
            </p>
          </div>
          <Badge tone={overview?.status?.rateLimitEnabled ? 'ok' : 'danger'}>
            {overview?.status?.rateLimitEnabled ? 'محمي' : 'معطّل'}
          </Badge>
        </Card>
      </div>

      {/* بطاقات المؤشرات الأمنية الحية */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-ink-muted">إجمالي الطلبات المحمية</p>
          <p className="mt-1 text-2xl font-bold text-ink-primary">
            {(overview?.metrics?.totalRequests ?? 0).toLocaleString('ar-SA')}
          </p>
          <span className="text-[11px] text-ink-muted">طلبات عبر طبقة الفحص الأمني</span>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-ink-muted">حجب تجاوز المعدل (429)</p>
          <p className="mt-1 text-2xl font-bold text-warning">
            {(overview?.metrics?.blockedRateLimit ?? 0).toLocaleString('ar-SA')}
          </p>
          <span className="text-[11px] text-ink-muted">هجمات DoS ومسح آلي تم صده</span>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-ink-muted">حجب العناوين المحظورة (403)</p>
          <p className="mt-1 text-2xl font-bold text-coral">
            {(overview?.metrics?.blockedIpBans ?? 0).toLocaleString('ar-SA')}
          </p>
          <span className="text-[11px] text-ink-muted">طلبات من عناوين IP مدرجة بالقائمة السوداء</span>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-ink-muted">محاولات تسجيل دخول فاشلة</p>
          <p className="mt-1 text-2xl font-bold text-gold-300">
            {(overview?.metrics?.failedLogins ?? 0).toLocaleString('ar-SA')}
          </p>
          <span className="text-[11px] text-ink-muted">صد محاولات التخمين والتسلل</span>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* العمود الأول: إعدادات الحماية الديناميكية */}
        <Card className="p-5 lg:col-span-1 space-y-4">
          <h2 className="flex items-center gap-2 font-bold text-gold-200">
            <IconSettings className="size-4" />
            <span>ضبط قواعد الحماية التلقائية</span>
          </h2>
          <p className="text-xs text-ink-muted">
            تُطبق التغييرات فورًا على جميع خوادم التطبيق دون الحاجة لإعادة التشغيل.
          </p>

          {settings && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.rateLimitEnabled}
                  onChange={(e) => setSettings({ ...settings, rateLimitEnabled: e.target.checked })}
                  className="rounded border-line"
                />
                <span className="text-sm font-medium">تفعيل محدد معدل الطلبات (Rate Limiting)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoBanEnabled}
                  onChange={(e) => setSettings({ ...settings, autoBanEnabled: e.target.checked })}
                  className="rounded border-line"
                />
                <span className="text-sm font-medium">الحظر التلقائي عند تكرار التجاوز (Auto-Jail)</span>
              </label>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>الحد الأدنى لدرجة reCAPTCHA:</span>
                  <span className="font-bold text-gold-200">{settings.recaptchaMinScore}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.1"
                  value={settings.recaptchaMinScore}
                  onChange={(e) => setSettings({ ...settings, recaptchaMinScore: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <p className="text-[10px] text-ink-muted">
                  0.9 = حماية قصوى (قد ترفض بعض المستخدمين)، 0.5 = متوازن وموصى به.
                </p>
              </div>

              <Field label="مدة الحظر التلقائي (بالدقائق)">
                <Input
                  type="number"
                  min="5"
                  max="1440"
                  value={settings.banDurationMinutes}
                  onChange={(e) => setSettings({ ...settings, banDurationMinutes: parseInt(e.target.value, 10) || 30 })}
                />
              </Field>

              <Button loading={savingSettings} onClick={handleSaveSettings} className="w-full">
                حفظ الإعدادات
              </Button>
            </div>
          )}
        </Card>

        {/* العمود الثاني والثالث: إدارة العناوين المحظورة */}
        <Card className="p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold text-gold-200">
              <IconProhibited className="size-4" />
              <span>العناوين المحظورة ({bans.length})</span>
            </h2>
            <Badge tone="danger">{bans.length} محظور حاليًا</Badge>
          </div>

          {/* إضافة حظر يدوي */}
          <div className="rounded-xl border border-line bg-surface/40 p-3 space-y-3">
            <p className="text-xs font-semibold text-ink-primary">حظر عنوان IP يدويًا:</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <Input
                placeholder="مثال: 198.51.100.4"
                dir="ltr"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                className="sm:col-span-2"
              />
              <Input
                placeholder="السبب (مثال: محاولات تخمين)"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="المدة (د)"
                  type="number"
                  dir="ltr"
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  className="w-20"
                />
                <Button size="sm" variant="danger" loading={banningIp} onClick={handleBanIp} className="shrink-0">
                  حظر
                </Button>
              </div>
            </div>
          </div>

          {/* جدول المحظورين */}
          {bans.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">لا توجد عناوين محظورة حاليًا.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-line text-ink-muted">
                    <th className="py-2 text-start font-medium">عنوان IP</th>
                    <th className="py-2 text-start font-medium">السبب</th>
                    <th className="py-2 text-start font-medium">وقت الحظر</th>
                    <th className="py-2 text-start font-medium">ينتهي في</th>
                    <th className="py-2 text-end font-medium">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {bans.map((b) => (
                    <tr key={b.id} className="hover:bg-elevated/40">
                      <td className="py-2 font-mono font-semibold text-ink-primary">{b.ip}</td>
                      <td className="py-2 text-ink-secondary">{b.reason}</td>
                      <td className="py-2 text-ink-muted">{formatDateTime(b.bannedAt)}</td>
                      <td className="py-2 text-ink-muted">
                        {b.permanent ? 'دائم' : b.expiresAt ? formatDateTime(b.expiresAt) : '—'}
                      </td>
                      <td className="py-2 text-end">
                        <Button size="sm" variant="subtle" onClick={() => void handleUnban(b.ip)}>
                          رفع الحظر
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* سجل الحوادث والتهديدات الأمنية الحديثة */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-gold-200">
              <IconIncident className="size-4" />
              <span>سجل الحوادث والأنشطة المشبوهة (Security Incidents)</span>
            </h2>
            <p className="text-xs text-ink-muted">
              رصد لمحاولات كسر الحسابات، حقن التعليمات، الطلبات غير المصرحة، وأحداث الأمان الحرجة.
            </p>
          </div>
          <Badge tone="muted">{incidents.length} حدث مسجل</Badge>
        </div>

        {incidents.length === 0 ? (
          <EmptyState title="لا توجد حوادث أمنية مسجلة" hint="المنظومة تعمل بشكل طبيعي ومستقر." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th className="py-2.5 text-start font-medium">الخطورة</th>
                  <th className="py-2.5 text-start font-medium">نوع الحدث</th>
                  <th className="py-2.5 text-start font-medium">عنوان IP</th>
                  <th className="py-2.5 text-start font-medium">المسار المستهدف</th>
                  <th className="py-2.5 text-start font-medium">الوقت</th>
                  <th className="py-2.5 text-start font-medium">الحالة</th>
                  <th className="py-2.5 text-end font-medium">معالجة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {incidents.map((inc) => {
                  const severityTone =
                    inc.severity === 'CRITICAL'
                      ? 'danger'
                      : inc.severity === 'HIGH'
                        ? 'danger'
                        : inc.severity === 'MEDIUM'
                          ? 'warn'
                          : 'muted';

                  return (
                    <tr key={inc.id} className="hover:bg-elevated/40">
                      <td className="py-2">
                        <Badge tone={severityTone}>{inc.severity}</Badge>
                      </td>
                      <td className="py-2 font-mono font-semibold text-ink-primary">{inc.eventType}</td>
                      <td className="py-2 font-mono text-ink-secondary">{inc.ip}</td>
                      <td className="py-2 font-mono text-ink-muted">{inc.endpoint || '—'}</td>
                      <td className="py-2 text-ink-muted">{formatDateTime(inc.createdAt)}</td>
                      <td className="py-2">
                        {inc.resolved ? (
                          <Badge tone="ok" className="inline-flex items-center gap-1">
                            <IconCheck className="size-3" />
                            <span>تمت المعالجة</span>
                          </Badge>
                        ) : (
                          <Badge tone="warn">قيد المتابعة</Badge>
                        )}
                      </td>
                      <td className="py-2 text-end">
                        {!inc.resolved && (
                          <Button size="sm" variant="subtle" onClick={() => void handleResolveIncident(inc.id)}>
                            تحديد كمعالج
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
