# Account Recovery Security Architecture & Takeover Defense
## Siraj Educational Academy (أكاديمية سراج التعليمية)

---

## 1. Threat Model & Recovery Objectives

Account recovery involving permanently lost email addresses is an administrative account takeover operation. In educational platforms, teachers hold intellectual property, active student cohorts, and financial balances, while students hold academic progress and orders.

### Primary Threat Vectors Addressed
1. **Rogue Admin Abuse (Insider Threat)**: A compromised or rogue administrator attempting to silently reassign an instructor or student account to their own email address.
2. **Social Engineering & Phishing**: Attackers claiming lost access through fake support channels.
3. **Token Interception & Replay**: Interception of recovery URLs through network eavesdropping or server logs.
4. **Session Hijacking After Recovery**: Previous legitimate or illegitimate sessions remaining authenticated after credentials change.
5. **Anti-Enumeration & Data Leakage**: Leaking registered user emails through recovery verification endpoints.

---

## 2. Recovery Workflows Comparison

| Security Dimension | Pipeline 1: Original Email Recovery | Pipeline 2: Alternative Email Recovery |
|---|---|---|
| **Scenario** | User forgot password but still has access to mailbox | User permanently lost mailbox (domain closed, graduated, etc.) |
| **Trigger** | Admin clicks "Send Recovery Email" | Admin initiates formal multi-step recovery request |
| **Identity Verification** | Inherent via possession of original registered email | Formal verification: National ID, Passport, Video Call, etc. |
| **Approval Tier** | Single authorized administrator (`users.password_recovery`) | **Dual-Admin Approval** for all high-risk accounts |
| **Token Dispatch** | Sent directly to original verified email | Sent **only** to validated alternative email address |
| **Token Expiry** | 30 minutes | 30 minutes |
| **Token Storage** | SHA-256 hash only (`AuthToken`) | SHA-256 hash only (`AccountRecoveryRequest`) |
| **Completion Flow** | User resets password at `/reset-password` | User verifies & resets at `/recovery/verify` |
| **Atomic Effects** | Pass hash updated, sessions revoked, audit logged | Email updated, verified, pass hash updated, sessions revoked |
| **Dual Alerts** | Notification to registered email | Confirm to new email + Security alert to old email |

---

## 3. Automated Risk Classification Engine

Prior to creating or approving an alternative email recovery request, the backend executes `assessUserRisk(userId)`:

```typescript
// Classification criteria
1. Role check:
   - If role === 'ADMIN' => High Risk (Mandatory Dual Approval)
2. Teacher check:
   - If role === 'TEACHER' and (has published courses OR active services) => High Risk
3. State check:
   - If status === 'SUSPENDED' => High Risk
4. Modification freshness check:
   - If user updated within last 48 hours => High Risk
```

When an account is flagged as **High Risk**, `approvalRequired = true` is permanently locked onto the request. The initiating administrator **CANNOT** generate or send a verification token without a secondary administrator reviewing the justification and explicitly approving it.

---

## 4. Dual-Admin Approval Protocol (Four-Eyes Principle)

To prevent insider threat and unauthorized account takeover:

1. **Step 1 — Initiation**: Admin A enters alternative email, reason, identity verification method, notes, and evidence reference (e.g. ticket ID). A sequential recovery number is assigned (`REC-YYYY-XXXXXX`).
2. **Step 2 — Status Lock**: The request enters `PENDING_APPROVAL`. No recovery token is created, and no email is sent.
3. **Step 3 — Anti-Self-Approval Enforcement**:
   ```typescript
   if (request.initiatorId === reviewerAdmin.id) {
     throw forbidden("Dual approval violation: An initiating administrator cannot approve their own recovery request.");
   }
   ```
4. **Step 4 — Review & Issuance**: Admin B reviews the identity notes and decision. Upon approval (`decision = 'APPROVED'`):
   - A 32-byte cryptographically secure token is generated (`crypto.randomBytes(32).toString('hex')`).
   - Only its SHA-256 hash is stored in `AccountRecoveryRequest.tokenHash`.
   - The status transitions to `VERIFICATION_SENT`.
   - The bilingual verification email is dispatched to the alternative email.
   - An immutable `AccountRecoveryApproval` record is created.

---

## 5. Atomic Completion & Session Invalidation

When the user clicks `/recovery/verify?token=...` and submits their new password:

```
┌───────────────────────────────────────────────────────────────┐
│                     PRISMA $TRANSACTION                       │
│                                                               │
│ 1. User.update:                                               │
│    - email = request.alternativeEmail                         │
│    - emailVerified = true, emailVerifiedAt = NOW()            │
│    - passwordHash = bcrypt.hash(newPassword, 12)              │
│    - sessionVersion = sessionVersion + 1                      │
│                                                               │
│ 2. UserSession.updateMany:                                    │
│    - endedAt = NOW(), endReason = 'ACCOUNT_RECOVERY_COMPLETED'│
│                                                               │
│ 3. AuthToken.updateMany:                                      │
│    - usedAt = NOW() (invalidates all outstanding tokens)      │
│                                                               │
│ 4. AccountRecoveryRequest.update:                             │
│    - status = 'COMPLETED', completedAt = NOW()                │
│    - tokenHash = null (scrubbed to prevent replay)            │
│                                                               │
│ 5. AuditLog.create:                                           │
│    - action = 'ACCOUNT_RECOVERY_COMPLETED'                    │
│    - oldValues = { email: originalEmail }                     │
│    - newValues = { email: alternativeEmail }                  │
└───────────────────────────────────────────────────────────────┘
```

### Why Incrementing `sessionVersion` Works
The platform's `requireAuth` middleware verifies incoming JWT cookies by checking:
```typescript
if ((payload.sv ?? 0) !== user.sessionVersion) {
  return next(unauthorized("انتهت صلاحية الجلسة، سجّل الدخول من جديد"));
}
```
Because `sessionVersion` is incremented inside the transaction, every active browser session and JWT across all devices is rendered instantly invalid.
