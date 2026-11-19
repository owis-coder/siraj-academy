import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Offering, type Lesson, type ExplainRequest, type LiveSession, type Course, type Ad } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Card, Badge, Button, StatCard, Skeleton, EmptyState, Modal, Form, Field, Input, Select, Textarea } from '../../../components/ui';
import { OFFERING_STATUS_LABEL, TEACHER_STATUS_LABEL, formatDateTime, formatMoney, URGENCY_LABEL, AD_STATUS_LABEL } from '../../../lib/format';
import { useToast } from '../../../lib/toast';
import { useI18n } from '../../../i18n';

/* ================= نظرة عامة ================= */
export function TeacherHome() {
  const { user } = useAuth();
  const { t, formatNumber } = useI18n();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [offers, setOffers] = useState<{ count: number }>({ count: 0 });
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // دوراتي عبر المسار العام mine=true، وحصصي عبر /live-sessions?mine=true
    Promise.allSettled([
      fetch('/api/v1/offerings/mine?limit=50', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { data: [] })),
      api.liveSessions.mine(),
    ]).then(([o, s]) => {
      if (!alive) return;
      const od = ((o as { data?: unknown }).data ?? []) as Offering[];
      setOfferings(Array.isArray(od) ? od : []);
      setSessions(s.status === 'fulfilled' ? s.value.data ?? [] : []);
      setLoading(false);
    });
    api.teacher.earnings().catch(() => {});
    void offers;
    return () => { alive = false; };
  }, []);

  const approved = user?.teacherProfile?.status === 'APPROVED';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('td.homeTitle')}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t('td.statusLabel')}
          {user ? <b className="text-gold-200"> {t(TEACHER_STATUS_LABEL[user.teacherProfile?.status ?? 'PENDING'])}</b> : null}
        </p>
      </div>

      {!approved && (
        <Card className="border-warn/40 p-6 text-sm leading-7 text-gold-200">
          {t('td.notApproved')}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('td.statPublished')} value={loading ? null : formatNumber(offerings.filter((o) => o.status === 'PUBLISHED').length)} />
        <StatCard label={t('td.statSessions')} value={loading ? null : formatNumber(sessions.length)} tone="teal" />
        <StatCard label={t('td.statEarnings')} value={loading ? null : '—'} hint={t('td.earningsHint')} tone="ok" />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-gold-200">{t('sd.myCoursesTitle')}</h2>
          <Link to="/teacher/offerings" className="text-sm text-gold-300 hover:text-gold-200">{t('td.manageCourses')}</Link>
        </div>
        {offerings.length === 0 ? (
          <EmptyState compact title={t('td.noData')} hint={t('td.firstCourseHint')} action={<Link to="/teacher/offerings"><Button size="sm" variant="outline">{t('td.createCourse')}</Button></Link>} />
        ) : (
          <div className="divide-y divide-line/60 rounded-lg border border-line bg-surface">
            {offerings.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                <span>{o.title ?? o.course?.title ?? t('td.courseFallback')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gold-300">{formatMoney(o.price)}</span>
                  <Badge tone={o.status === 'PUBLISHED' ? 'ok' : o.status === 'DRAFT' ? 'muted' : 'warn'}>{t(OFFERING_STATUS_LABEL[o.status])}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ================= إدارة الدورات (Offerings CRUD) ================= */
type LessonDraft = { title: string; videoUrl: string; access: 'TRIAL' | 'PAID' };

export function TeacherOfferings() {
  const toast = useToast();
  const { t } = useI18n();
  const [items, setItems] = useState<Offering[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; offering?: Offering }>({ open: false });

  const load = () => {
    setLoading(true);
    fetch('/api/v1/offerings/mine?limit=50', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { data?: Offering[] }) => { setItems(j.data ?? []); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
    api.courses.list({}).then(({ data }) => setCourses(data ?? [])).catch(() => setCourses([]));
  };
  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('sd.myCoursesTitle')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('td.offeringsSubtitle')}</p>
        </div>
        <Button onClick={() => setModal({ open: true })}>{t('td.newCourse')}</Button>
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('td.noData')} hint={t('td.noCoursesHint')} action={<Button variant="outline" onClick={() => setModal({ open: true })}>{t('td.createFirstCourse')}</Button>} />
      ) : (
        <div className="space-y-4">
          {items.map((o) => (
            <Card key={o.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{o.title ?? o.course?.title ?? t('td.courseFallback')}</p>
                  <p className="mt-1 text-xs text-ink-muted">{o.course?.title} {(o.course?.code)}</p>
                  {(o.lessons?.length ?? 0) > 0 && (
                    <p className="mt-1 text-xs text-ink-muted">
                      {t('td.paidLessons', { count: (o.lessons ?? []).filter((l) => l.access === 'PAID').length })} · {t('td.trialLessons', { count: (o.lessons ?? []).filter((l) => l.access === 'TRIAL').length })}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-gold-300">{formatMoney(o.price)}</span>
                  <Badge tone={o.status === 'PUBLISHED' ? 'ok' : o.status === 'DRAFT' ? 'muted' : o.status === 'PENDING_REVIEW' ? 'warn' : o.status === 'HIDDEN' ? 'info' : 'danger'}>{t(OFFERING_STATUS_LABEL[o.status])}</Badge>
                  <Button size="sm" variant="subtle" onClick={() => setModal({ open: true, offering: o })}>{t('td.edit')}</Button>
                  {(o.status === 'DRAFT' || o.status === 'HIDDEN') && (
                    <Button size="sm" loading={false} onClick={async () => {
                      try { await api.offerings.submit(o.id); toast.push('success', t('td.sentForReview')); load(); }
                      catch (e) { toast.push('error', e instanceof Error ? e.message : t('td.submitFailed')); }
                    }}>{t('td.submitForReview')}</Button>
                  )}
                  {o.status !== 'HIDDEN' && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      try { await api.offerings.update(o.id, { status: 'HIDDEN' }); load(); }
                      catch { toast.push('error', t('td.hideFailed')); }
                    }}>{t('td.hide')}</Button>
                  )}
                  {o.status === 'HIDDEN' && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      try { await api.offerings.update(o.id, { status: 'DRAFT' }); load(); }
                      catch { toast.push('error', t('td.showFailed')); }
                    }}>{t('td.show')}</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal.open && (
        <OfferingEditor
          offering={modal.offering}
          courses={courses}
          onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); load(); }}
        />
      )}
    </div>
  );
}

function OfferingEditor({ offering, courses, onClose, onSaved }: { offering?: Offering; courses: Course[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { t } = useI18n();
  const [title, setTitle] = useState(offering?.title ?? '');
  const [courseId, setCourseId] = useState(offering?.courseId ?? '');
  const [summary, setSummary] = useState(offering?.summary ?? '');
  const [price, setPrice] = useState(String(offering?.price ?? ''));
  const [lessons, setLessons] = useState<LessonDraft[]>(
    (offering?.lessons ?? []).map((l: Lesson) => ({ title: l.title, videoUrl: l.videoUrl, access: l.access })) ?? [{ title: '', videoUrl: '', access: 'TRIAL' }],
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!courseId) { toast.push('error', t('td.chooseCourse')); return; }
    if (!summary.trim() || summary.trim().length < 20) {
      toast.push('error', t('td.summaryMin'));
      return;
    }
    const validLessons = lessons.filter((l) => l.title.trim() && l.videoUrl.trim());
    const payload = {
      courseId,
      title: title.trim() || undefined,
      summary: summary.trim(),
      price: Number(price) || 0,
    };
    setSaving(true);
    try {
      let offId = offering?.id;
      if (offId) {
        await api.offerings.update(offId, payload);
      } else {
        const res = await api.offerings.create(payload);
        offId = res.data?.id;
      }
      if (offId && validLessons.length > 0) {
        for (let idx = 0; idx < validLessons.length; idx++) {
          const l = validLessons[idx];
          try {
            await api.offerings.addLesson(offId, {
              title: l.title.trim(),
              videoUrl: l.videoUrl.trim(),
              access: l.access,
              order: idx + 1,
            });
          } catch {
            // continue adding remaining lessons
          }
        }
      }
      toast.push('success', offering ? t('td.courseUpdated') : t('td.courseCreated'));
      onSaved();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('td.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={offering ? t('td.editCourse') : t('td.newCourse')} wide>
      <Form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('td.subject')} required hint={t('td.subjectHint')}>
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">{t('td.choose')}</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.code ? ` (${c.code})` : ''}</option>)}
            </Select>
          </Field>
          <Field label={t('td.priceLabel')} required hint={t('td.freeZeroHint')}>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <Field label={t('td.courseTitle')} hint={t('td.courseTitleHint')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('td.courseTitlePlaceholder')} />
        </Field>
        <Field label={t('td.summary')} required hint={t('td.summaryHint')}>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t('td.summaryPlaceholder')} />
        </Field>

        <div>
          <p className="mb-2 text-sm font-semibold text-gold-200">{t('td.lessons')}</p>
          <div className="space-y-3">
            {lessons.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-line bg-elevated/40 p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                <Input placeholder={t('td.lessonTitle')} value={l.title} onChange={(e) => setLessons((s) => s.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <Input dir="ltr" placeholder={t('td.youtubeUrl')} value={l.videoUrl} onChange={(e) => setLessons((s) => s.map((x, j) => (j === i ? { ...x, videoUrl: e.target.value } : x)))} />
                <Select value={l.access} onChange={(e) => setLessons((s) => s.map((x, j) => (j === i ? { ...x, access: e.target.value as 'TRIAL' | 'PAID' } : x)))} className="w-28">
                  <option value="TRIAL">{t('td.trial')}</option>
                  <option value="PAID">{t('td.paid')}</option>
                </Select>
                <Button type="button" variant="danger" size="sm" onClick={() => setLessons((s) => s.filter((_, j) => j !== i))}>{t('td.delete')}</Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setLessons((s) => [...s, { title: '', videoUrl: '', access: 'PAID' }])}>{t('td.addLesson')}</Button>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="subtle" onClick={onClose}>{t('td.cancel')}</Button>
          <Button type="submit" loading={saving}>{t('td.save')}</Button>
        </div>
      </Form>
    </Modal>
  );
}

/* ================= طلبات متاحة لي ================= */
export function TeacherRequests() {
  const toast = useToast();
  const { t } = useI18n();
  const [items, setItems] = useState<ExplainRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ExplainRequest | null>(null);
  const { user } = useAuth();

  const load = () => {
    setLoading(true);
    api.requests.list({ status: 'OPEN' }).then(({ data }) => { setItems(data ?? []); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(() => {
    if (user?.teacherProfile?.status !== 'APPROVED') setLoading(false);
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.teacherProfile?.status]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('sd.requestsTitle')}</h1>
        <p className="text-sm text-ink-muted">{t('td.requestsSubtitle')}</p>
      </div>
      {!user?.teacherProfile || user.teacherProfile.status !== 'APPROVED' ? (
        <EmptyState title={t('td.pendingApproval')} hint={t('td.pendingApprovalHint')} />
      ) : loading ? <Skeleton className="h-56 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('td.noOpenRequests')} hint={t('td.noOpenRequestsHint')} />
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.courseTitle}</p>
                  <p className="mt-1 text-xs text-ink-muted">#{r.requestNo ?? r.id.slice(0, 6)} · {r.university?.name} · {t(URGENCY_LABEL[r.urgency])} · {r.budget ? t('td.budgetSuggested', { amount: formatMoney(r.budget) }) : t('td.noBudget')}</p>
                  {r.details && <p className="mt-2 text-sm text-ink-secondary">{r.details}</p>}
                </div>
                <Button size="sm" onClick={() => setActive(r)}>{t('td.makeOffer')}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {active && <OfferModal r={active} onClose={() => setActive(null)} onDone={load} submit={async (body) => {
        await api.requests.createOffer(active.id, body);
        toast.push('success', t('td.offerSent'));
      }} />}
    </div>
  );
}

function OfferModal({ r, onClose, onDone, submit }: { r: ExplainRequest; onClose: () => void; onDone: () => void; submit: (b: { price: number; message?: string; timelineDays?: number }) => Promise<void> }) {
  const { t } = useI18n();
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState('');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal open onClose={onClose} title={t('td.offerOnRequest', { no: r.requestNo ?? r.id.slice(0, 6) })}>
      <Form
        onSubmit={async () => {
          const p = Number(price);
          if (!price || Number.isNaN(p) || p < 5 || p > 10000) { setErr(t('td.priceRange')); return; }
          setErr(null); setBusy(true);
          try {
            await submit({ price: p, message: msg || undefined, timelineDays: days ? Number(days) : undefined });
            onDone(); onClose();
          } catch (e) {
            setErr(e instanceof Error ? e.message : t('td.sendFailed'));
          } finally { setBusy(false); }
        }}
        className="space-y-4"
      >
        <Field label={t('td.offerPrice')} required error={err ?? undefined}><Input type="number" min={5} max={10000} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label={t('td.messageToStudent')}><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
        <Field label={t('td.durationDays')}><Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Button type="submit" loading={busy} className="w-full">{t('td.sendOffer')}</Button>
      </Form>
    </Modal>
  );
}

/* ================= إعلاناتي ================= */
export function TeacherAds() {
  const toast = useToast();
  const { t } = useI18n();
  const [items, setItems] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    api.ads.list(true).then(({ data }) => { setItems(data ?? []); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('td.adsTitle')}</h1>
          <p className="text-sm text-ink-muted">{t('td.adsSubtitle')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t('td.newAd')}</Button>
      </div>
      {loading ? <Skeleton className="h-56 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('td.noAds')} hint={t('td.noAdsHint')} action={<Button variant="outline" onClick={() => setCreating(true)}>{t('td.createAd')}</Button>} />
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{a.title}</p>
                  {a.body && <p className="mt-1 text-sm text-ink-secondary">{a.body}</p>}
                  {a.linkUrl && <a href={a.linkUrl} target="_blank" rel="noreferrer" dir="ltr" className="mt-1 block text-xs text-teal hover:underline">{a.linkUrl}</a>}
                  {a.reviewerNote && <p className="mt-2 rounded-md border border-danger/30 bg-danger/5 p-2 text-xs text-coral">{t('td.adminNote', { note: a.reviewerNote })}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={a.status === 'APPROVED' ? 'ok' : a.status === 'PENDING_REVIEW' ? 'warn' : a.status === 'REJECTED' ? 'danger' : 'muted'}>{t(AD_STATUS_LABEL[a.status])}</Badge>
                  {a.status === 'DRAFT' && (
                    <>
                      <Button size="sm" onClick={async () => { try { await api.ads.submit(a.id); toast.push('success', t('td.adSent')); load(); } catch (e) { toast.push('error', e instanceof Error ? e.message : t('td.submitFailed')); } }}>{t('td.submitForReview')}</Button>
                      <Button size="sm" variant="subtle" onClick={async () => {
                        const nextTitle = prompt(t('td.adTitlePrompt'), a.title); if (nextTitle == null) return;
                        const nextBody = prompt(t('td.adBodyPrompt'), a.body ?? '');
                        try { await api.ads.update(a.id, { title: nextTitle, body: nextBody ?? undefined }); toast.push('success', t('td.updated')); load(); } catch { toast.push('error', t('td.editFailed')); }
                      }}>{t('td.edit')}</Button>
                    </>
                  )}
                  {a.status === 'APPROVED' && (
                    <Button size="sm" variant="ghost" onClick={async () => { try { await api.ads.update(a.id, { title: a.title, body: a.body, imageUrl: a.imageUrl, linkUrl: a.linkUrl }); toast.push('success', t('td.editReturnsReviewMsg')); load(); } catch { toast.push('error', t('td.editFailed')); } }}>{t('td.editReturnsReview')}</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {creating && (
        <AdCreate onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}

function AdCreate({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={t('td.newAd')}>
      <Form onSubmit={async () => {
        if (!title.trim()) return;
        setBusy(true);
        try {
          await api.ads.create({ title, body: body || undefined, imageUrl: imageUrl || undefined, linkUrl: linkUrl || undefined });
          onDone();
        } catch { /* */ }
        finally { setBusy(false); }
      }} className="space-y-4">
        <Field label={t('td.adTitle')} required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t('td.adBody')}><Textarea value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Field label={t('td.imageUrlOptional')}><Input dir="ltr" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} /></Field>
        <Field label={t('td.pageUrlOptional')}><Input dir="ltr" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} /></Field>
        <Button type="submit" loading={busy} className="w-full">{t('td.saveDraft')}</Button>
      </Form>
    </Modal>
  );
}

/* ================= الحصص المباشرة ================= */
export function TeacherLive() {
  const toast = useToast();
  const { t, formatNumber } = useI18n();
  const [items, setItems] = useState<LiveSession[]>([]);
  const [ offerings, setOfferings ] = useState<Offering[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.liveSessions.mine().then(({ data }) => { setItems(data ?? []); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(() => { load(); fetch('/api/v1/offerings/mine?limit=50', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { data: [] })).then((j: { data?: Offering[] }) => setOfferings(j.data ?? [])).catch(() => setOfferings([])); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('td.liveTitle')}</h1>
          <p className="text-sm text-ink-muted">{t('td.liveSubtitle')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t('td.newSession')}</Button>
      </div>
      {loading ? <Skeleton className="h-56 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('td.noSessions')} hint={t('td.noSessionsHint')} action={<Button variant="outline" onClick={() => setCreating(true)}>{t('td.scheduleSession')}</Button>} />
      ) : (
        <div className="divide-y divide-line/60 rounded-lg border border-line bg-surface">
          {items.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="mt-1 text-xs text-ink-muted">{formatDateTime(s.startsAt)} · {t('td.minutes', { count: formatNumber(s.durationMin ?? 60) })} · {t('td.seats', { count: s.capacity ? formatNumber(s.capacity) : '—' })}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={s.price ? 'gold' : 'ok'}>{s.price ? formatMoney(s.price) : t('td.free')}</Badge>
                <Badge tone="info">{t('td.bookingsCount', { count: formatNumber(s.bookingsCount ?? 0) })}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && (
        <Modal open onClose={() => setCreating(false)} title={t('td.scheduleLive')}>
          <LiveForm offerings={offerings} onDone={() => { setCreating(false); load(); }} />
        </Modal>
      )}
      {void toast}
    </div>
  );
}

function LiveForm({ offerings, onDone }: { offerings: Offering[]; onDone: () => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [durationMin, setDurationMin] = useState('60');
  const [price, setPrice] = useState('0');
  const [capacity, setCapacity] = useState('');
  const [offeringId, setOfferingId] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Form onSubmit={async () => {
      if (!title.trim() || !startsAt) return;
      setBusy(true);
      try {
        await api.liveSessions.create({ title, startsAt: new Date(startsAt).toISOString(), durationMin: Number(durationMin) || 60, price: Number(price) || 0, capacity: capacity ? Number(capacity) : undefined, offeringId: offeringId || undefined });
        onDone();
      } catch { /* */ }
      finally { setBusy(false); }
    }} className="space-y-4">
      <Field label={t('td.sessionTitle')} required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('td.startsAt')} required><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
        <Field label={t('td.durationMin')}><Input type="number" min={15} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('td.priceFree')}><Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label={t('td.seatsOptional')}><Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
      </div>
      <Field label={t('td.linkedCourse')}>
        <Select value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
          <option value="">{t('td.generalSession')}</option>
          {offerings.map((o) => <option key={o.id} value={o.id}>{o.title ?? o.course?.title}</option>)}
        </Select>
      </Field>
      <Button type="submit" loading={busy} className="w-full">{t('td.schedule')}</Button>
    </Form>
  );
}

/* ================= أرباحي ================= */
export function TeacherEarnings() {
  const { t } = useI18n();
  const [data, setData] = useState<{
    gross?: number;
    dues?: number;
    commissionRate?: number;
    total?: number;
    commission?: number;
    net?: number;
    ordersCount?: number;
    breakdown?: Record<string, unknown>[];
    rows?: Record<string, unknown>[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.teacher.earnings().then(({ data }) => setData(data)).catch(() => setData({ rows: [] })).finally(() => setLoading(false));
  }, []);

  const total = Number(data?.gross ?? data?.total ?? 0);
  const net = Number(data?.dues ?? data?.net ?? 0);
  const commission = (data?.commissionRate != null ? Math.round(total * data.commissionRate * 100) / 100 : Number(data?.commission ?? 0)) || Math.max(0, total - net);
  const rows = data?.breakdown ?? data?.rows ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('td.earningsTitle')}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('td.grossSales')} value={loading ? null : formatMoney(total)} />
        <StatCard label={t('td.platformCommission')} value={loading ? null : formatMoney(commission)} tone="coral" />
        <StatCard label={t('td.netDues')} value={loading ? null : formatMoney(net)} tone="ok" />
      </div>
      <Card>
        {loading ? <Skeleton className="m-4 h-48" /> : !rows.length ? (
          <EmptyState compact title={t('td.noData')} hint={t('td.earningsEmptyHint')} />
        ) : (
          <div className="divide-y divide-line/60">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <span className="font-medium text-ink-primary">{String(r.title ?? r.orderNo ?? t('td.operation'))}</span>
                  {Boolean(r.paidAt) && <span className="ms-2 text-xs text-ink-muted">· {formatDateTime(String(r.paidAt))}</span>}
                </div>
                <span className="font-semibold text-gold-300">{formatMoney(Number(r.amount ?? 0))}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================= الملف المهني للمعلم ================= */
export function TeacherProfileDash() {
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const [degree, setDegree] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [bio, setBio] = useState('');
  const [universitiesText, setUniversitiesText] = useState('');
  const [docsUrl, setDocsUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [docsBusy, setDocsBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (user?.teacherProfile) {
      const p = user.teacherProfile as unknown as { degree?: string; specialties?: string[] | string; bio?: string; universitiesText?: string; docsUrl?: string | null };
      setDegree(p.degree ?? '');
      setSpecialties(Array.isArray(p.specialties) ? p.specialties.join('، ') : (p.specialties ?? ''));
      setBio(p.bio ?? '');
      setUniversitiesText(p.universitiesText ?? '');
      setDocsUrl(p.docsUrl ?? '');
    }
  }, [user?.teacherProfile]);

  // رفع وثائق التحقق: الملف يُرفع أولًا (خاص) ثم يُربط بملف المدرس عبر الخادم
  const uploadDocs = async (file: File) => {
    setDocsBusy(true);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error(t('td.maxFile25'));
      const { data } = await api.uploads.create(file);
      const res = await fetch('/api/v1/teacher/verification-docs', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docsUrl: data.url }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? t('td.docsSaveFailed'));
      }
      setDocsUrl(data.url);
      toast.push('success', t('td.docsUploaded'));
      await refresh();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('td.uploadFailed'));
    } finally {
      setDocsBusy(false);
    }
  };

  if (!user) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('td.profileTitle')}</h1>
        <Badge tone={user.teacherProfile?.status === 'APPROVED' ? 'ok' : user.teacherProfile?.status === 'REJECTED' ? 'danger' : 'warn'}>
          {t(TEACHER_STATUS_LABEL[user.teacherProfile?.status ?? 'PENDING'])}
        </Badge>
      </div>
      {user.teacherProfile?.status === 'PENDING' && (
        <Card className="p-6 text-sm leading-7 text-gold-200">
          {t('td.awaitingApproval')}
        </Card>
      )}
      <Card className="p-6">
        <Form onSubmit={async () => {
          setSaving(true);
          try {
            const res = await fetch(`/api/v1/teacher/profile`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ degree, specialties, bio, universitiesText }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { message?: string };
              throw new Error(body.message ?? t('td.saveCheck'));
            }
            toast.push('success', t('td.updated'));
            await refresh();
          } catch (e) {
            toast.push('error', e instanceof Error ? e.message : t('td.saveFailed'));
          } finally { setSaving(false); }
        }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('td.degree')}><Input value={degree} onChange={(e) => setDegree(e.target.value)} /></Field>
            <Field label={t('td.specialties')} hint={t('td.commaSeparated')}><Input value={specialties} onChange={(e) => setSpecialties(e.target.value)} /></Field>
          </div>
          <Field label={t('td.teachingUniversities')}><Input value={universitiesText} onChange={(e) => setUniversitiesText(e.target.value)} /></Field>
          <Field label={t('td.bio')}><Textarea value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
          <Button type="submit" loading={saving}>{t('td.save')}</Button>
        </Form>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">{t('td.verificationDocs')}</p>
            <p className="mt-1 text-xs leading-6 text-ink-muted">
              {t('td.docsHint')}
            </p>
          </div>
          {docsUrl && (
            <a href={docsUrl} target="_blank" rel="noreferrer" className="text-xs text-teal hover:underline">
              {t('td.viewDocs')}
            </a>
          )}
        </div>
        <input
          type="file"
          accept="image/*,.pdf,.zip"
          disabled={docsBusy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDocs(f); e.target.value = ''; }}
          className="mt-4 w-full max-w-sm rounded-md border border-line bg-elevated/60 p-2 text-xs file:me-2 file:rounded-md file:border-0 file:bg-gold-500/20 file:px-3 file:py-1.5 file:text-gold-200"
        />
        {docsBusy && <p className="mt-2 text-xs text-ink-muted">{t('td.uploading')}</p>}
        {!docsUrl && <p className="mt-2 text-xs text-warn">{t('td.noDocsYet')}</p>}
      </Card>
    </div>
  );
}

/* حجوزات تُعرَض ضمن الحصص مباشرة (bookingsCount) */
