import { useState, useEffect } from 'react';
import { api, type TeacherWithdrawal } from '../../../lib/api';
import { Card, Badge, Button, Skeleton, EmptyState, Form, Field, Input } from '../../../components/ui';
import { formatMoney, formatDateTime } from '../../../lib/format';
import { useToast } from '../../../lib/toast';

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'coral' | 'teal' | 'gold'> = {
  PENDING: 'warn',
  UNDER_REVIEW: 'gold',
  NEEDS_INFORMATION: 'coral',
  APPROVED: 'teal',
  PROCESSING: 'gold',
  PAID: 'ok',
  REJECTED: 'coral',
  FAILED: 'coral',
  CANCELLED: 'warn',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  UNDER_REVIEW: 'تحت المراجعة',
  NEEDS_INFORMATION: 'مطلوب توضيح',
  APPROVED: 'معتمد (بانتظار الصرف)',
  PROCESSING: 'جاري التحويل',
  PAID: 'تم الصرف',
  REJECTED: 'مرفوض',
  FAILED: 'فشل التحويل',
  CANCELLED: 'ملغي',
};

export default function AdminWithdrawals() {
  const toast = useToast();
  const [items, setItems] = useState<TeacherWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modals
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<TeacherWithdrawal | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);

  // Review Form
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // Execute Form
  const [transferProofUrl, setTransferProofUrl] = useState('');
  const [transferReferenceNo, setTransferReferenceNo] = useState('');
  const [executing, setExecuting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.withdrawals.adminList(statusFilter ? { status: statusFilter } : undefined);
      setItems(res.data || []);
    } catch {
      toast.push('error', 'تعذر تحميل طلبات السحب');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const openReview = (w: TeacherWithdrawal) => {
    setSelectedWithdrawal(w);
    setReviewDecision('APPROVED');
    setAdminNotes(w.adminNotes || '');
    setRejectionReason('');
    setShowReviewModal(true);
  };

  const openExecute = (w: TeacherWithdrawal) => {
    setSelectedWithdrawal(w);
    setTransferProofUrl('');
    setTransferReferenceNo('');
    setShowExecuteModal(true);
  };

  const handleReviewSubmit = async () => {
    if (!selectedWithdrawal) return;
    if (reviewDecision === 'REJECTED' && (!rejectionReason.trim() || rejectionReason.trim().length < 3)) {
      toast.push('error', 'سبب الرفض إلزامي لتحرير الرصيد وإعادته للمدرس');
      return;
    }

    setReviewing(true);
    try {
      await api.withdrawals.adminReview(selectedWithdrawal.id, {
        decision: reviewDecision,
        adminNotes,
        rejectionReason: reviewDecision === 'REJECTED' ? rejectionReason : undefined,
      });
      toast.push('success', 'تمت مراجعة طلب السحب بنجاح');
      setShowReviewModal(false);
      loadData();
    } catch (e: any) {
      toast.push('error', e.message || 'فشل مراجعة الطلب');
    } finally {
      setReviewing(false);
    }
  };

  const handleExecuteSubmit = async () => {
    if (!selectedWithdrawal) return;
    if (!transferProofUrl.trim() || !transferReferenceNo.trim()) {
      toast.push('error', 'رابط إشعار الحوالة البنكية والرقم المرجعي مطلوبان');
      return;
    }

    setExecuting(true);
    try {
      await api.withdrawals.adminExecute(selectedWithdrawal.id, {
        transferProofUrl,
        transferReferenceNo,
      });
      toast.push('success', 'تم توثيق تنفيذ حوالة السحب البنكية بنجاح');
      setShowExecuteModal(false);
      loadData();
    } catch (e: any) {
      toast.push('error', e.message || 'فشل توثيق التحويل البنكي');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إدارة مسيرات وسحوبات أرباح المدرسين</h1>
          <p className="mt-1 text-sm text-ink-muted">
            مراجعة طلبات سحب الأرباح واعتمادها وتوثيق الحوالات البنكية الصادرة للمدرسين
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-line bg-elevated px-3 py-1.5 text-xs text-ink focus:border-gold-400 focus:outline-none"
          >
            <option value="">جميع الحالات</option>
            <option value="PENDING">قيد الانتظار</option>
            <option value="APPROVED">معتمد (بانتظار الصرف)</option>
            <option value="PAID">تم الصرف</option>
            <option value="REJECTED">مرفوض</option>
          </select>
          <Button size="sm" variant="outline" onClick={loadData}>
            تحديث
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : items.length === 0 ? (
          <EmptyState compact title="لا توجد طلبات سحب" hint="لا توجد طلبات تطابق الفلتر المحدد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-line bg-surface/50 text-xs text-ink-muted">
                <tr>
                  <th className="px-4 py-3 text-start">رقم السحب</th>
                  <th className="px-4 py-3 text-start">المدرس</th>
                  <th className="px-4 py-3 text-start">الحساب البنكي والآيبان</th>
                  <th className="px-4 py-3 text-start">المبلغ الصافي</th>
                  <th className="px-4 py-3 text-start">الحالة</th>
                  <th className="px-4 py-3 text-start">التاريخ</th>
                  <th className="px-4 py-3 text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {items.map((w) => (
                  <tr key={w.id} className="hover:bg-elevated/30">
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-gold-300">
                      {w.withdrawalNo}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold">{w.teacher?.user?.fullName || 'مدرس'}</p>
                      <p className="font-mono text-xs text-ink-muted">{w.teacher?.user?.email}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink">{w.payoutMethod?.bankName}</p>
                      <p className="font-mono text-xs text-gold-300" dir="ltr">{w.payoutMethod?.ibanMasked}</p>
                      <p className="text-[11px] text-ink-muted">{w.payoutMethod?.accountHolderName}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-mono font-bold text-base text-ink">{formatMoney(w.amount)}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={STATUS_TONES[w.status] || 'gold'}>
                        {STATUS_LABELS[w.status] || w.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-ink-muted">
                      {formatDateTime(w.createdAt)}
                    </td>
                    <td className="px-4 py-3.5 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {w.status === 'PENDING' && (
                          <Button size="sm" onClick={() => openReview(w)}>
                            مراجعة الطلب
                          </Button>
                        )}
                        {w.status === 'APPROVED' && (
                          <Button size="sm" variant="primary" onClick={() => openExecute(w)}>
                            توثيق الصرف
                          </Button>
                        )}
                        {w.transferProofUrl && (
                          <a
                            href={w.transferProofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-elevated text-xs text-gold-300 hover:text-gold-200"
                            title="عرض سند الحوالة البنكية"
                          >
                            📄
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review Modal */}
      {showReviewModal && selectedWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold">مراجعة طلب السحب {selectedWithdrawal.withdrawalNo}</h3>
              <button onClick={() => setShowReviewModal(false)} className="text-ink-muted hover:text-ink text-sm font-bold">✕</button>
            </div>

            <div className="mb-4 rounded-md border border-line bg-elevated/40 p-3 text-xs space-y-1">
              <p><span className="text-ink-muted">المدرس:</span> {selectedWithdrawal.teacher?.user?.fullName} ({selectedWithdrawal.teacher?.user?.email})</p>
              <p><span className="text-ink-muted">البنك:</span> {selectedWithdrawal.payoutMethod?.bankName}</p>
              <p><span className="text-ink-muted">الآيبان:</span> <span className="font-mono text-gold-300" dir="ltr">{selectedWithdrawal.payoutMethod?.ibanMasked}</span></p>
              <p><span className="text-ink-muted">المبلغ المطلوب سحبه:</span> <b className="font-mono text-base font-bold text-ink">{formatMoney(selectedWithdrawal.amount)}</b></p>
            </div>

            <Form onSubmit={handleReviewSubmit} className="space-y-4">
              <Field label="قرار المراجعة">
                <select
                  value={reviewDecision}
                  onChange={(e) => setReviewDecision(e.target.value as any)}
                  className="w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-ink focus:border-gold-400 focus:outline-none"
                >
                  <option value="APPROVED">اعتماد الطلب للصرف البنكي</option>
                  <option value="REJECTED">رفض الطلب وتحرير الرصيد المحجوز للمدرس</option>
                </select>
              </Field>

              {reviewDecision === 'REJECTED' && (
                <Field label="سبب الرفض (إلزامي — سيصل إشعار للمدرس)">
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-coral/50 bg-elevated px-3 py-2 text-sm text-ink focus:outline-none"
                    placeholder="وضح للمدرس سبب رفض طلب السحب (مثلاً خطأ في رقم الحساب أو اشتباه أمني)..."
                    required
                  />
                </Field>
              )}

              <Field label="ملاحظات إدارية (اختياري)">
                <Input
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="ملاحظات للاستخدام الداخلي..."
                />
              </Field>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="subtle" onClick={() => setShowReviewModal(false)}>
                  إلغاء
                </Button>
                <Button type="submit" loading={reviewing}>
                  تأكيد قرار المراجعة
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      )}

      {/* Execute Modal */}
      {showExecuteModal && selectedWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold">توثيق تحويل الأرباح للمدرس</h3>
              <button onClick={() => setShowExecuteModal(false)} className="text-ink-muted hover:text-ink text-sm font-bold">✕</button>
            </div>

            <div className="mb-4 rounded-md border border-teal-500/20 bg-teal-500/10 p-3 text-xs space-y-1 text-teal">
              <p>المبلغ المحول: <b className="font-mono font-bold text-sm">{formatMoney(selectedWithdrawal.amount)}</b></p>
              <p>إلى: {selectedWithdrawal.payoutMethod?.bankName} ({selectedWithdrawal.payoutMethod?.ibanMasked})</p>
              <p>صاحب الحساب: {selectedWithdrawal.payoutMethod?.accountHolderName}</p>
            </div>

            <Form onSubmit={handleExecuteSubmit} className="space-y-4">
              <Field label="الرقم المرجعي للحوالة البنكية (Reference No)">
                <Input
                  value={transferReferenceNo}
                  onChange={(e) => setTransferReferenceNo(e.target.value)}
                  placeholder="رقم العملية الصادر من تطبيق البنك التشغيلي"
                  required
                />
              </Field>

              <Field label="رابط أو مسار صورة إشعار التحويل البنكي">
                <Input
                  value={transferProofUrl}
                  onChange={(e) => setTransferProofUrl(e.target.value)}
                  placeholder="https://... أو /uploads/..."
                  required
                />
              </Field>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="subtle" onClick={() => setShowExecuteModal(false)}>
                  إلغاء
                </Button>
                <Button type="submit" loading={executing}>
                  تأكيد الصرف وإقفال الطلب
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      )}
    </div>
  );
}
