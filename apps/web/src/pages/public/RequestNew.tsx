import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type University, type College, type Major } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Button, Card, Form, Field, Input, Select, Textarea, Badge, Steps } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { useI18n } from '../../i18n';
import { IconArrowForward, IconArrowBack } from '../../components/icons';

const WHATSAPP_RE = /^(05|5|9665|\+9665)\d{8}$/;

type FormState = {
  fullName: string;
  whatsapp: string;
  universityId: string;
  collegeId: string;
  majorText: string;
  courseTitle: string;
  details: string;
  studentsCount: string;
  type: 'ONLINE' | 'IN_PERSON' | 'BOTH';
  urgency: 'NOW' | 'DAY' | 'WEEK' | 'TERM';
  budget: string;
  linkUrl: string;
};

const INITIAL: FormState = {
  fullName: '',
  whatsapp: '',
  universityId: '',
  collegeId: '',
  majorText: '',
  courseTitle: '',
  details: '',
  studentsCount: '1',
  type: 'ONLINE',
  urgency: 'DAY',
  budget: '',
  linkUrl: '',
};

export default function RequestNew() {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [f, setF] = useState<FormState>(() => ({
    ...INITIAL,
    fullName: user?.fullName ?? '',
    whatsapp: user?.whatsapp ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [unis, setUnis] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [majors, setMajors] = useState<Major[]>([]);
  const [sending, setSending] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    api.universities.list().then(({ data }) => setUnis(data ?? [])).catch(() => setUnis([]));
  }, []);

  useEffect(() => {
    if (!f.universityId) { setColleges([]); setMajors([]); return; }
    api.colleges.list(f.universityId).then(({ data }) => setColleges(data ?? [])).catch(() => setColleges([]));
    api.majors.list(f.universityId).then(({ data }) => setMajors(data ?? [])).catch(() => setMajors([]));
  }, [f.universityId]);

  useEffect(() => {
    setF((s) => ({ ...s, fullName: s.fullName || user?.fullName || '', whatsapp: s.whatsapp || user?.whatsapp || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const validateStep = (s: number): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (s === 1) {
      if (!f.fullName.trim()) e.fullName = t('requestNew.nameRequired');
      if (f.whatsapp && !WHATSAPP_RE.test(f.whatsapp.replace(/[\s-]/g, ''))) e.whatsapp = t('requestNew.whatsappErr');
      if (f.whatsapp && !f.universityId) e.universityId = t('requestNew.universityRequired');
    }
    if (s === 2) {
      if (!f.courseTitle.trim() || f.courseTitle.trim().length < 3) e.courseTitle = t('requestNew.subjectMin');
      if (!f.details.trim() || f.details.trim().length < 10) e.details = t('requestNew.detailsMin');
    }
    if (s === 3) {
      if (f.linkUrl && !/^https?:\/\//.test(f.linkUrl)) e.linkUrl = t('requestNew.linkInvalid');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validateStep(step)) setStep((s) => Math.min(3, s + 1)); };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    // الإرسال متاح للطلاب المسجلين فقط
    if (!user) {
      toast.push('info', t('requestNew.loginFirst'));
      nav('/login', { state: { from: '/requests/new' } });
      return;
    }
    if (user.role !== 'STUDENT') {
      toast.push('error', t('requestNew.studentOnlyToast'));
      return;
    }
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      toast.push('error', t('requestNew.missingFields'));
      return;
    }
    setSending(true);
    try {
      await api.requests.create({
        universityId: f.universityId || undefined,
        collegeId: f.collegeId || undefined,
        majorText: f.majorText || undefined,
        courseTitle: f.courseTitle,
        details: f.details,
        studentsCount: Number(f.studentsCount) || 1,
        type: f.type,
        urgency: f.urgency,
        budget: f.budget ? Number(f.budget) : undefined,
        linkUrl: f.linkUrl || undefined,
        attachments: [],
      });
      toast.push('success', t('requestNew.sent'));
      nav('/dashboard/requests');
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('requestNew.failed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container-x max-w-3xl py-10">
      <PageHeader
        title={t('requestNew.title')}
        subtitle={t('requestNew.subtitle')}
        action={<Badge tone="gold">{t('requestNew.stepsBadge')}</Badge>}
      />

      {user && user.role !== 'STUDENT' ? (
        <Card className="border-gold-500/30 bg-gold-500/10 p-8 text-center">
          <p className="text-lg font-bold text-gold-200">{t('requestNew.studentOnlyTitle')}</p>
          <p className="mt-2 text-sm text-ink-muted">
            {user.role === 'TEACHER'
              ? t('requestNew.teacherNotice')
              : t('requestNew.adminNotice')}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to={user.role === 'TEACHER' ? '/teacher/requests' : '/admin/requests'}>
              <Button>
                {user.role === 'TEACHER'
                  ? t('requestNew.toTeacherRequests')
                  : t('requestNew.toAdminRequests')}
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <Steps
            current={step}
            steps={[
              { key: '1', label: t('requestNew.step1') },
              { key: '2', label: t('requestNew.step2') },
              { key: '3', label: t('requestNew.step3') },
            ]}
            onGo={(s) => s < step && setStep(s)}
            className="mb-8"
          />

      <Card className="p-6 sm:p-8">
        {step === 1 && (
          <Form onSubmit={next} className="space-y-4">
            <p className="text-sm font-semibold text-gold-200">{t('requestNew.sec1')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('requestNew.name')} required error={errors.fullName}>
                <Input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder={t('requestNew.namePlaceholder')} />
              </Field>
              <Field label={t('requestNew.whatsapp')} hint={t('requestNew.whatsappHint')} error={errors.whatsapp}>
                <Input dir="ltr" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="9665xxxxxxxx" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('requestNew.university')} required error={errors.universityId}>
                <Select value={f.universityId} onChange={(e) => set('universityId', e.target.value)}>
                  <option value="">{t('requestNew.chooseUniversity')}</option>
                  {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
              <Field label={t('requestNew.collegeOptional')}>
                <Select value={f.collegeId} onChange={(e) => set('collegeId', e.target.value)} disabled={!f.universityId}>
                  <option value="">—</option>
                  {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            </div>
            <Field label={t('requestNew.majorOptional')}>
              <Select value={f.majorText} onChange={(e) => set('majorText', e.target.value)} disabled={majors.length === 0}>
                <option value="">—</option>
                {majors.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button type="submit" className="inline-flex items-center gap-1.5">
                <span>{t('requestNew.next')}</span>
                <IconArrowForward className="size-4" />
              </Button>
            </div>
          </Form>
        )}

        {step === 2 && (
          <Form onSubmit={next} className="space-y-4">
            <p className="text-sm font-semibold text-gold-200">{t('requestNew.sec2')}</p>
            <Field label={t('requestNew.courseTitle')} required error={errors.courseTitle}>
              <Input value={f.courseTitle} onChange={(e) => set('courseTitle', e.target.value)} placeholder={t('requestNew.coursePlaceholder')} />
            </Field>
            <Field label={t('requestNew.detailsLabel')} required error={errors.details}>
              <Textarea value={f.details} onChange={(e) => set('details', e.target.value)} className="min-h-32" placeholder={t('requestNew.detailsPlaceholder')} />
            </Field>
            <Field label={t('requestNew.budgetLabel')}>
              <Input type="number" min={0} value={f.budget} onChange={(e) => set('budget', e.target.value)} placeholder={t('requestNew.budgetPlaceholder')} />
            </Field>
            <div className="flex justify-between">
              <Button variant="subtle" type="button" onClick={back} className="inline-flex items-center gap-1.5">
                <IconArrowBack className="size-4" />
                <span>{t('requestNew.prev')}</span>
              </Button>
              <Button type="submit" className="inline-flex items-center gap-1.5">
                <span>{t('requestNew.next')}</span>
                <IconArrowForward className="size-4" />
              </Button>
            </div>
          </Form>
        )}

        {step === 3 && (
          <Form onSubmit={submit} className="space-y-4">
            <p className="text-sm font-semibold text-gold-200">{t('requestNew.sec3')}</p>
            <Field label={t('requestNew.attachmentLabel')} error={errors.linkUrl} hint={t('requestNew.attachmentHint')}>
              <Input dir="ltr" value={f.linkUrl} onChange={(e) => set('linkUrl', e.target.value)} placeholder="https://…" />
            </Field>
            <div className="rounded-lg border border-line-gold bg-gold-500/5 p-4 text-sm text-ink-secondary">
              <p className="mb-2 font-semibold text-gold-200">{t('requestNew.journeyTitle')}</p>
              <ol className="space-y-1.5">
                <li>{t('requestNew.journey1')}</li>
                <li>{t('requestNew.journey2')}</li>
                <li>{t('requestNew.journey3')}</li>
                <li>{t('requestNew.journey4')}</li>
              </ol>
            </div>

            <div className="flex justify-between">
              <Button variant="subtle" type="button" onClick={back} className="inline-flex items-center gap-1.5">
                <IconArrowBack className="size-4" />
                <span>{t('requestNew.prev')}</span>
              </Button>
              <Button type="submit" loading={sending}>{user ? t('requestNew.submit') : t('requestNew.registerAndSubmit')}</Button>
            </div>
          </Form>
        )}
      </Card>
        </>
      )}
    </div>
  );
}
