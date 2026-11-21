import { useEffect, useRef, useState } from 'react';
import { api, type ChatMessage, type ChatRoom, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Input, EmptyState, Spinner } from './ui';
import { formatDateTime } from '../lib/format';
import { useI18n } from '../i18n';
import { IconAttachment } from './icons';

/** محادثة تشغيل بـ Polling (كل 3 ثوان) + إرفاق مرفق */
export function ChatThread({ room }: { room: ChatRoom | null }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMsgs([]);
    if (!room) return;
    let alive = true;
    const load = async () => {
      try {
        const { data } = await api.chat.messages(room.id);
        if (alive && user) setMsgs(data ?? []);
        await api.chat.read(room.id).catch(() => {});
      } catch { /* تجاهل */ }
    };
    setLoading(true);
    load().finally(() => alive && setLoading(false));
    const timer = setInterval(load, 3000);
    return () => { alive = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const send = async (file?: File | null) => {
    if (!room || (!text.trim() && !file)) return;
    setSending(true);
    try {
      let attachmentUrl: string | undefined;
      if (file) attachmentUrl = (await api.uploads.create(file)).data.url;
      await api.chat.send(room.id, { body: text.trim() || undefined, attachmentUrl });
      setText('');
      const { data } = await api.chat.messages(room.id);
      setMsgs(data ?? []);
    } catch { /* يُعرض الخطأ من الصفحة المستضيفة */ }
    finally { setSending(false); }
  };

  if (!room) return <EmptyState title={t('chat.pickRoom')} hint={t('chat.pickRoomHint')} compact />;
  const isAdminViewer = user?.role === 'ADMIN';
  const peer = (room.participants ?? []).find(
    (p: User) => (p.id || (p as { userId?: string }).userId) !== user?.id && (!isAdminViewer || p.role !== 'ADMIN')
  ) ?? (room.participants ?? []).find((p: User) => (p.id || (p as { userId?: string }).userId) !== user?.id);

  const isSupport = !isAdminViewer && (room.isSupport || (room.participants ?? []).some((p) => p.role === 'ADMIN' || (p as { username?: string }).username === 'siraj_support'));

  return (
    <div className="flex h-[calc(100vh-190px)] min-h-96 flex-col rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-9 place-items-center rounded-full text-sm ${
              isSupport
                ? 'border border-gold-500/50 bg-gold-500/20 font-bold text-gold-300'
                : 'border border-line-gold text-gold-200'
            }`}
            aria-hidden
          >
            {isSupport ? 'س' : (peer?.fullName ?? room.title ?? t('chat.fallbackName')).charAt(0)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">
                {isAdminViewer
                  ? (peer ? `${peer.fullName}` : room.title)
                  : isSupport
                    ? 'الدعم الفني — أكاديمية سراج'
                    : (room.title ?? peer?.fullName ?? t('chat.fallback'))}
              </p>
              {isAdminViewer && peer && (
                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${
                  peer.role === 'TEACHER' ? 'bg-teal/15 text-teal' : 'bg-gold-500/15 text-gold-300'
                }`}>
                  {peer.role === 'TEACHER' ? 'مدرّس' : 'طالب'}
                </span>
              )}
              {isSupport && (
                <span className="inline-flex items-center gap-1 rounded bg-teal/15 px-2 py-0.5 text-[10px] font-bold text-teal">
                  <span className="size-1.5 rounded-full bg-teal animate-pulse" />
                  فريق الدعم
                </span>
              )}
            </div>
            <p className="text-[11px] text-ink-muted">
              {isAdminViewer
                ? `محادثة دعم فني مباشر مع ${peer?.fullName ?? 'المستخدم'} • @${peer?.username ?? ''}`
                : isSupport
                  ? 'فريق الدعم الرسمي • متواجدون لمساعدتك والإجابة على أي استفسار'
                  : (room.type === 'DIRECT' ? t('chat.direct') : t('chat.group'))}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {loading && <div className="grid place-items-center py-6"><Spinner /></div>}
        {msgs.length === 0 && !loading && <p className="py-10 text-center text-sm text-ink-muted">{t('chat.noMessages')}</p>}
        {msgs.map((m) => {
          const mine = m.senderId === user?.id;
          const isSenderSupport = (m.sender as { role?: string; username?: string })?.role === 'ADMIN' || (m.sender as { role?: string; username?: string })?.username === 'siraj_support';
          return (
            <div key={m.id} className={`flex ${mine ? 'flex-row-reverse justify-start' : ''}`}>
              <div className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-6 ${mine ? 'border border-gold/30 bg-gold-500/15' : isSenderSupport ? 'border border-gold-500/30 bg-surface-2' : 'border border-line bg-elevated'}`}>
                {!mine && isSenderSupport && (
                  <span className="mb-1.5 inline-flex items-center gap-1 rounded bg-gold-500/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-300">
                    الدعم الفني
                  </span>
                )}
                {!mine && !isSenderSupport && isAdminViewer && m.sender?.fullName && (
                  <span className="mb-1.5 block text-[10px] font-bold text-ink-secondary">
                    {m.sender.fullName}
                  </span>
                )}
                {m.body && <p className="whitespace-pre-line text-ink-primary">{m.body}</p>}
                {m.attachmentUrl && (
                  <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-teal hover:underline">
                    <IconAttachment className="size-3.5" />
                    <span>{t('chat.attachment')}</span>
                  </a>
                )}
                <p className="mt-1 text-[10px] text-ink-muted">{formatDateTime(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2">
          <label className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md border border-line text-ink-muted transition-colors hover:text-gold-200" title={t('chat.attach')}>
            <IconAttachment className="size-4" />
            <input
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ''; }}
            />
          </label>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isSupport ? 'اكتب رسالتك أو استفسارك لفريق الدعم هنا...' : t('chat.placeholder')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          />
          <Button size="sm" loading={sending} onClick={() => void send()}>{t('common.send')}</Button>
        </div>
      </div>
    </div>
  );
}
