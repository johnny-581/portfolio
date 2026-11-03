---
title: ux hub design system
tag: club
when: 2025-26
published: 2026-04-11
summary: Tokens, components and a Figma library shared by UX Hub's site, portal and event graphics.
links:
  - label: ubcuxhub.ca
    href: https://ubcuxhub.ca
---

By the fall of 2025, UX Hub had three blues. The website used one, the portal used another, and the event posters used whatever the designer that week had open. Nobody had decided this. It just happened, one deadline at a time.

The design system started as a one-page list of colours and grew into a Figma library, a set of tokens, and about thirty components that the site and the [portal](/projects/ubc-uxhub-portal) both build from.

## what's in it

- tokens for colour, type, spacing and radius, exported from Figma variables to CSS custom properties with a small script
- components in React with Tailwind: buttons, inputs, cards, tags, dialogs, tables, and the event card that shows up everywhere
- a poster template set, so event graphics use the same type and grid as the site

<mark>The goal was never consistency for its own sake. It was so a new member could ship a page in their first week.</mark> Every component has a usage note written for someone who joined last month, not for me.

## what I'd do differently

We named tokens after colours first (`blue-500`) and roles second (`accent`). Half the team used one, half used the other, and the rename took a weekend. Start with roles.

We also built a date picker nobody asked for. It's very nice. It's used on one page.

The library now has eleven contributors, which is more than the number of people who understood the old CSS.
