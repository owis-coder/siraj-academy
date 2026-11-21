# Admin User Account Management System — Architecture & Guide
## Siraj Educational Academy (أكاديمية سراج التعليمية)

---

## 1. Overview & Objectives

The **Admin User Account Management and Recovery System** is an enterprise-grade extension built into the Siraj Academy core platform. It centralizes and safeguards administrative operations across all student and teacher accounts.

Key capabilities:
- **Unified Directory & Search**: Real-time searching across full names, usernames, emails, and account IDs with multidimensional filters (role, status, email verification, risk level, and recovery status).
- **Administrative Inspection & Modification**: Safe inspection of profile details, academic records, teacher profiles, registered devices, active sessions, and historical administrative modifications.
- **Controlled Account Lifecycle**: Administrative suspension, reactivation, immediate session revocation, and role updates with strict safeguards against self-demotion or self-suspension.
- **Two Distinct Recovery Pipelines**:
  1. *Original Email Password Recovery*: Immediate, cryptographically secure 30-minute single-use reset links sent to the currently verified email address.
  2. *Lost Original Email Alternative Recovery*: Secure identity-verified takeover workflow featuring automated risk classification, mandatory dual-admin approval for high-risk accounts, single-use token verification, and atomic database execution.

---

## 2. System Architecture

```
                    ┌────────────────────────┐
                    │      Admin Client      │
                    │   (Admin Dashboard)    │
                    └───────────┬────────────┘
                                │
               HTTPS /api/v1/admin/users
                                │
              ┌─────────────────▼──────────────────┐
              │   Authentication & Permissions     │
              │   • requireAuth('ADMIN')           │
              │   • requireAdminPermission(...)    │
              └─────────────────┬──────────────────┘
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
┌──────────────┐       ┌─────────────────┐      ┌─────────────────┐
│ User Service │       │ Recovery Engine │      │ Audit & Alerts  │
│ • Directory  │       │ • Risk Scoring  │      │ • Immutable Log │
│ • Sessions   │       │ • Dual Approval │      │ • Dual-Email    │
│ • Lifecycle  │       │ • Atomic Switch │      │   Notifications │
└──────┬───────┘       └────────┬────────┘      └────────┬────────┘
       │                        │                        │
       └────────────────────────┼────────────────────────┘
                                │
                      Prisma ORM Transaction
                                │
                    ┌───────────▼────────────┐
                    │  PostgreSQL Database   │
                    │      (Neon DB)         │
                    └────────────────────────┘
```

---

## 3. Directory & Filtering Specifications

The administrative user directory supports the following search targets:
- Full Name (Case-insensitive substring)
- Username (`@username`)
- Email Address (`user@domain.com`)
- User ID (CUID match)

### Predefined Filter Segments
| Filter Key | Criteria | Target |
|---|---|---|
| `all` | None | All registered accounts |
| `students` | `role = 'STUDENT'` | Only student learners |
| `teachers` | `role = 'TEACHER'` | Approved & pending instructors |
| `active` | `status = 'ACTIVE'` | Accounts in good standing |
| `suspended` | `status = 'SUSPENDED'` | Accounts halted by administration |
| `unverified` | `emailVerified = false` | Accounts with pending email verification |
| `recovery_required` | Has active/pending `AccountRecoveryRequest` | Accounts currently undergoing recovery |
| `recent_modified` | `updatedAt >= NOW() - 7 days` | Accounts updated within the past week |

---

## 4. Administrative Actions & Safeguards

1. **Profile Modification (`PATCH /api/v1/admin/users/:id/profile`)**:
   - Updates full name, contact information (WhatsApp), academic level, and teacher bio.
   - Preserves password hashes, tokens, and role permissions intact.

2. **Username Modification (`PATCH /api/v1/admin/users/:id/username`)**:
   - Enforces format `/^[a-zA-Z0-9_]{3,30}$/`.
   - Strictly enforces uniqueness against all existing platform accounts.

3. **Direct Email Change (`PATCH /api/v1/admin/users/:id/email`)**:
   - Requires explicit administrative reason (`reason.length >= 5`).
   - Checks format and uniqueness.
   - Automatically increments `sessionVersion` to drop active sessions for safety.
   - Logs previous and new email in the audit trail.

4. **Account Suspension (`POST /api/v1/admin/users/:id/suspend`)**:
   - Sets `status = 'SUSPENDED'`.
   - Increments `sessionVersion` immediately terminating all active client sessions.
   - Marks active `UserSession` records as `ADMIN_SUSPENDED`.
   - Sends bilingual notification email explaining suspension reasons.
   - *Safeguard*: Administrators cannot suspend their own account.

5. **Account Reactivation (`POST /api/v1/admin/users/:id/reactivate`)**:
   - Sets `status = 'ACTIVE'`.
   - Sends bilingual reactivation confirmation email.
   - Logs action in `AuditLog`.

6. **Revoke All Active Sessions (`POST /api/v1/admin/users/:id/revoke-sessions`)**:
   - Atomic increment of `user.sessionVersion`.
   - Sets `endedAt = NOW()` and `endReason = 'ADMIN_REVOKED_ALL_SESSIONS'` on all open sessions in `UserSession`.
   - Causes any active JWT tokens in browser cookies to be rejected immediately with 401 Unauthorized.

7. **Protected Role Change (`POST /api/v1/admin/users/:id/role`)**:
   - Dedicated endpoint with explicit confirmation flag (`confirm: true`).
   - When promoting to `TEACHER`, creates default `TeacherProfile` if not present.
   - *Safeguard*: An administrator cannot change their own role or revoke their own admin rights.
