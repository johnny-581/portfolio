---
title: scalepad cs
tag: work
when: "2026"
published: 2026-08-22
summary: An internal workspace that gives ScalePad's customer success team one view of each account's health, notes and next steps.
links:
  - label: scalepad
    href: https://www.scalepad.com/
---

ScalePad's customer success managers look after hundreds of MSP accounts each. Before this project, getting ready for a call meant opening six tabs: the CRM, the billing system, product usage dashboards, support tickets, last quarter's notes, and a spreadsheet someone made in 2023.

I spent my first months at ScalePad on an internal tool that puts those in one place. Each account gets a single page with its health, recent activity, open tickets, and what was promised on the last call.

## what I worked on

- the account page: a timeline that merges usage events, tickets and notes, newest first, with filters for each source
- a health score panel that shows *why* a score changed, not just the number. A drop from 82 to 64 lists the three things behind it.
- call prep: a short summary generated from the timeline, which the CSM edits before the call. It's a draft, not a verdict.
- the sync jobs that pull from each source on a schedule, and the boring work of matching account ids across systems that disagree about what an account is

<mark>The best feedback was a CSM saying she'd stopped keeping her own notes doc.</mark>

## what I learned

Internal tools get honest feedback fast. If something is wrong, someone messages you before lunch. I shipped smaller changes, more often, and sat in on calls to watch the tool get used, which taught me more than any dashboard.

Some of this is internal, so the details here stay general.
