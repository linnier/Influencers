# 2.7.9 — Project shortlist global filter sync

The top search previously refreshed the workspace without filtering its shortlist. Pass query, platform and project owner into the shortlist and intersect with offer group and follow-up status. Search includes name, tags, region, email, contact, membership, account handle and profile URL. Account matching respects platform; owner matching respects project co-owners.

Show matching and total counts with an explicit empty state. Top-filter changes clear row selection; select-all affects matching rows. All-shortlist export still includes every shortlisted creator as advertised. Matched rows retain all source accounts and saved cooperation account selections. Filters add no API reads or writes.

Validation passed: shortlist-filter-tests.mjs, shortlist-save-ui-tests.mjs, shortlist-export-tests.mjs, project-offers-ui-tests.mjs and syntax checks. Real Chromium exercised actual global email search, platform/status intersections, unmatched creators, counts, selection reset, select-all and mobile layout with no runtime errors or creator mutations. Browser artifacts are outside the repository. Production deployment is pending.
