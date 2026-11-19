import { useEffect, useState } from 'react';
import { api, type Order } from '../lib/api';
import { useToast } from '../lib/toast';
import { Badge, Button, Card } from './ui';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, formatMoney, formatDate } from '../lib/format';
import { useI18n } from '../i18n';
import { IconTelegram } from './icons';

/** بطاقة تعليمات الدفع — تستخدم في كل مكان يظهر فيه طلب مالي */
export function PaymentPanel({ order, onChanged }: { order: Order; onChanged?: () => void }) {
  const toast = useToast();
  const { t } = useI18n();
  const [info, setInfo] = useState<{ iban?: string | null; bankName?: string | null; instructions?: string | null; telegramLink?: string | null; whatsappNumbers?: string | string[] | null } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.platform.public().then(({ data }) => {
      setInfo({ iban: data.iban, bankName: data.bankName, instructions: data.paymentInstructions, telegramLink: data.telegramLink, whatsappNumbers: data.whatsappNumbers });
    }).catch(() => setInfo(null));
  }, []);

  const status = (order?.status ?? 'AWAITING_PAYMENT') as keyof typeof ORDER_STATUS_LABEL;
  const canPay = status === 'AWAITING_PAYMENT' || status === 'REJECTED';
  const hasReceipt = status === 'AWAITING_REVIEW' || status === 'PAID';

  const upload = async () => {
    if (!file) { toast.push('error', t('payment.chooseFirst')); return; }
    if (!order?.id) return;
    setBusy(true);
    try {
      await api.orders.receipt(order.id, file);
      toast.push('success', t('payment.receiptSent'));
      onChanged?.();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('payment.receiptFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold text-gold-200">{t('payment.title')}</h3>
        <Badge tone={ORDER_STATUS_TONE[status] ?? 'warn'}>{t(ORDER_STATUS_LABEL[status] ?? 'payment.orderFallback')}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <InfoTile label={t('payment.orderNo')} value={`#${order?.orderNo ?? (order?.id ? order.id.slice(0, 8) : '—')}`} mono />
        <InfoTile label={t('payment.amount')} value={formatMoney(order?.amount ?? 0)} gold />
        <InfoTile label={t('payment.bank')} value={info?.bankName ?? t('payment.bankUnset')} />
      </div>

      <div className="mt-3 rounded-md border border-line bg-elevated/50 p-4 text-sm">
        <p className="mb-1 text-xs text-ink-muted">{t('payment.iban')}</p>
        <p dir="ltr" className="font-mono text-gold-200">{info?.iban ?? t('payment.ibanUnset')}</p>
      </div>

      {info?.instructions && (
        <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink-secondary">{info.instructions}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {info?.telegramLink && (
          <a href={info.telegramLink} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="inline-flex items-center gap-1.5">
              <span>{t('payment.goTelegram')}</span>
              <IconTelegram className="size-4" />
            </Button>
          </a>
        )}
      </div>

      {canPay && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-sm font-semibold text-ink-secondary">{t('payment.uploadLabel')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full max-w-xs rounded-md border border-line bg-elevated/60 p-2 text-xs file:me-2 file:rounded-md file:border-0 file:bg-gold-500/20 file:px-3 file:py-1.5 file:text-gold-200"
            />
            <Button size="sm" loading={busy} onClick={upload} disabled={!file}>{t('payment.sendReceipt')}</Button>
          </div>
        </div>
      )}

      {hasReceipt && (
        <div className="mt-4 rounded-md border border-warn/30 bg-warn/5 p-3 text-xs text-gold-200">
          {order.status === 'PAID' ? t('payment.paidNote') : t('payment.reviewNote')}
        </div>
      )}
    </Card>
  );
}

function InfoTile({ label, value, gold, mono }: { label: string; value: string; gold?: boolean; mono?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${gold ? 'border-line-gold bg-gold-500/5' : 'border-line bg-elevated/40'}`}>
      <p className="mb-1 text-xs text-ink-muted">{label}</p>
      <p className={`text-sm font-semibold ${gold ? 'text-gold-300' : 'text-ink-primary'} ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

export function OrderRow({ o, onChanged }: { o: Order; onChanged: () => void }) {
  const { t } = useI18n();
  const typeKey =
    o.targetType === 'OFFERING'
      ? 'payment.typeOffering'
      : o.targetType === 'SERVICE'
        ? 'payment.typeService'
        : o.targetType === 'OFFER'
          ? 'payment.typeOffer'
          : 'payment.typeCustom';
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{o.title ?? t('payment.orderFallback')}</p>
          <p className="text-xs text-ink-muted">
            #{o.orderNo ?? (o.id ? o.id.slice(0, 8) : '—')} · {t(typeKey)} · {formatDate(o.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-gold-300">{formatMoney(o.amount ?? 0)}</span>
          <Badge tone={ORDER_STATUS_TONE[o.status] ?? 'warn'}>{t(ORDER_STATUS_LABEL[o.status] ?? 'payment.orderFallback')}</Badge>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <PaymentPanel order={o} onChanged={onChanged} />
      </div>
    </Card>
  );
}
