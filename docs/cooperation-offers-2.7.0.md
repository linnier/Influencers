# Project cooperation offers (2.7.0)

The original project workspace, invitation screening, bilingual templates, mail design,
signup review and account permissions remain in place. This release adds persistent
project offer schemes and per-person offer assignments to that workflow.

## Using schemes

- Open a project → 邀约与报名 → 筛选邀约 → 批量设置合作方案.
- Create a named reciprocal, fixed-fee, or quotation scheme. Fees use the project's
  currency. Internal estimates, benefit costs and notes are not sent to creators.
- Set product/experience benefits, voucher quantity, content requirements and optional
  registration/publication deadlines. Empty dates inherit project defaults; publication
  cannot precede registration, and explicit publication windows must fit the deadline.
- Select creators and review the batch before applying it. Personal adjustments are
  protected unless the replacement checkbox is explicitly selected.
- Editing a scheme does not change existing assignments. Reapply it to update a group.
- Group filters and the grouped mail preview support checking different offers together.

The project's separate 项目预选 tab is an internal, unsent list. Creators can be added
from the directory without exporting. Preparing invitations opens the original screening
flow. Neither shortlist entry nor applying a scheme sends email, creates collaborations,
registers payments or issues vouchers. Existing eligibility checks, duplicate-email
checks, pending-mail preview and explicit send confirmation remain active.

## Creator application and review

Each invitation freezes its own offer and dates. Fixed/reciprocal invitations require
acceptance of the stated benefits; quotation invitations require a positive quote,
the deliverables covered and the project currency. The original quote is stored
separately from the final fee confirmed during review. Unknown quotations are never
displayed or booked as zero. Review still creates/updates the original person,
account and collaboration records, with one agreed fee per person/project.

## Confirmed cooperation changes and notifications

In 合作管理, use 个人权益与通知 to adjust one creator's agreement. This also supports
older directly-added/imported confirmed cooperations without fabricating a signup.
The form previews the resulting notification before saving. Saving creates a pending
notification; use 邮件通知 → 核对并发送 to send it explicitly. Existing automatic
confirmation/issuance settings retain their behavior for the original actions.

The adjustment changes agreed cash fee, benefits, voucher commitment and due date.
It does not alter payment/Post/issued-voucher records. Voucher commitment cannot fall
below recorded issuance. Existing invitation and notification bodies remain immutable.
If a save loses its response or partially completes, reopening the agreement offers
核对并完成上次权益保存, using the same change ID and the original prepared notice.

Project 通知设置 continues to edit common wording and requirements. Personal offers
override the corresponding variables for future notifications and creator portals.
Individual publication dates also inform reminder eligibility; disabled reminders
retain their cheap read-only preflight.

## Persistence, authorization and compatibility

No new business table or Lark fields are required. The existing 协作工作流 JSON store
holds `offer-scheme`, `project-selection`, `cooperation-agreement` and `offer-change`
records. Existing complete-workflow backups include them. Schemes and assignments use
project/person identities and optimistic versions; mutation authorization is rechecked
under the existing write lock. Viewers cannot mutate offers or read private offer notes.

Old clients/invitations without the new offer metadata retain their previous reward
and registration-cutoff behavior. New personal deadlines are independently resolved
and frozen when invitations are prepared. The original `mail-templates.js` and
`mail-design.js` files are unchanged.

Validation includes API and browser UI tests, durable SQLite restart/subpath HTTP
tests, role isolation, stale writes, personal override preservation, quote privacy,
per-person dates, interrupted agreement recovery, legacy agreement adjustments,
immutable mail, original invitation/review/issuance behavior, read performance and
backup compatibility. Test mail and providers are local stubs, never live sends.
