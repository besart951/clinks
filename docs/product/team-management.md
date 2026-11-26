# Team management

Settings › Team lists everyone with a login in the workspace. Managers give them a role, see who is still active and
let people go cleanly. Draft canvas: «CLinks – Benutzerverwaltung (Entwurf)».

## Phase 1 · Essentials (done)

- [x] **Last sign-in and devices** per person, from the workspace's refresh tokens (`GET /tenant/team` → `access`,
      only for `team.manage`). Over 30 days without sign-in is flagged.
- [x] **Sign out of all devices** (`POST /tenant/members/{id}/sign-out`): revokes the person's refresh tokens in this
      workspace; access tokens stop at the next request because the session check fails.
- [x] **Deactivate with handover**: deactivating signs the person out; with `releaseVisits` their future Spitex visits
      go back to «Offene Einsätze». The dialog lists those visits first.
- [x] **History**: `membership.role_changed` (from/to role), `membership.deactivated` (devices, visits),
      `membership.reactivated`, `membership.signed_out`; the last five show on the team page, all in Activity.

## Phase 2 · Security

- [ ] Two-factor sign-in required per role (planners and administrators see client data); column «Zwei-Faktor».
- [ ] Access that ends on a date (temporary staff, trainees); a daily job deactivates and hands visits back.
- [ ] Person page `/settings/team/{id}`: role, devices one by one, own history.

## Phase 3 · Convenience

- [ ] Invite several people at once (pasted e-mail list, one role).
- [ ] «View as role»: planners check what staff will see before releasing a week.
- [ ] Workload and area per person: weekly load warns about overplanning, automatic assignment respects areas.
- [ ] Staff without login who are planned anyway; an invitation links them to an account later.

## Open questions

- Should deactivation hand visits of an already released week to a named colleague instead of the open visits?
- Are released weeks with handed-back visits announced to staff again (plan notices)?
