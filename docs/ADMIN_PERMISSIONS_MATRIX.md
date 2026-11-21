# Admin Permissions Matrix & Role-Based Access Control
## Siraj Educational Academy (أكاديمية سراج التعليمية)

---

## 1. Permission Granularity Overview

Every administrative endpoint under `/api/v1/admin/users` is guarded by backend middleware requiring both:
1. Valid session with role `ADMIN`.
2. Explicit permission grant via `requireAdminPermission(permissionKey)`.

---

## 2. Permissions Matrix

| Permission Identifier | Description | Protected Endpoints | Minimum Role |
|---|---|---|---|
| `users.read` | View users list, search, filter, view stats, and inspect detailed user profile | `GET /api/v1/admin/users`<br>`GET /api/v1/admin/users/stats`<br>`GET /api/v1/admin/users/recoveries`<br>`GET /api/v1/admin/users/:id` | Admin / Auditor |
| `users.update` | Edit user profile details, change username (unique), and direct email modifications | `PATCH /api/v1/admin/users/:id/profile`<br>`PATCH /api/v1/admin/users/:id/username`<br>`PATCH /api/v1/admin/users/:id/email` | Admin |
| `users.suspend` | Suspend active user account, terminate sessions, and issue suspension notice | `POST /api/v1/admin/users/:id/suspend` | Admin / Supervisor |
| `users.reactivate` | Lift account suspension and restore normal platform access | `POST /api/v1/admin/users/:id/reactivate` | Admin / Supervisor |
| `users.sessions.revoke` | Invalidate all active browser sessions and reset session version | `POST /api/v1/admin/users/:id/revoke-sessions` | Admin / Security |
| `users.password_recovery` | Trigger single-use password recovery email to registered email address | `POST /api/v1/admin/users/:id/send-recovery-email` | Admin / Support |
| `users.email_recovery` | Initiate lost-email alternative recovery workflow with identity verification | `POST /api/v1/admin/users/:id/alternative-recovery` | Admin / Security |
| `users.recovery.approve` | Review and approve/reject high-risk alternative recovery requests (Dual Approval) | `POST /api/v1/admin/users/recoveries/:id/review` | Senior Admin / Supervisor |
| `users.roles.manage` | Change role between `STUDENT`, `TEACHER`, and `ADMIN` | `POST /api/v1/admin/users/:id/role` | Super Admin |

---

## 3. Role Inheritance & Defaults

1. **Super Admin / Default Admin**:
   - By default, all users with `role = 'ADMIN'` have wildcard access (`*`) unless explicitly restricted by assigning a non-empty `adminPermissions` array on their `User` record.
2. **Restricted Administrative Staff**:
   - If `adminPermissions` contains a subset of permissions (e.g. `['users.read', 'users.password_recovery']`), the user is permitted only those specific operations.
   - Any attempt to access other actions (such as `users.suspend` or `users.recovery.approve`) is immediately rejected with HTTP `403 Forbidden`.
3. **Student & Teacher Roles**:
   - Any request by `STUDENT` or `TEACHER` accounts to administrative endpoints is immediately rejected with HTTP `403 Forbidden`.
