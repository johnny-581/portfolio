---
title: scalepad desktop agent
tag: work
when: 2026-
published: 2026-10-18
summary: A lightweight agent that runs on client machines and reports hardware, warranty and software details back to ScalePad.
links:
  - label: scalepad
    href: https://www.scalepad.com/
---

MSPs manage thousands of laptops and desktops they never see in person. To plan replacements and renewals, ScalePad needs to know what each machine is, how old it is, and what's running on it. Most of that comes from other tools. The desktop agent fills in what they miss.

It's a small background service for Windows and macOS. It collects hardware details, OS version, disk health and installed software, and checks in a few times a day. It's the project I'm on now.

## what I'm working on

- the collectors: one per data source, each with a timeout, so one slow WMI query can't hold up the rest
- the check-in protocol: the agent only sends what changed since last time, which cut payloads by about 90%
- the installer and auto-update flow, including rolling back cleanly when an update fails halfway
- a tray app that shows the machine's owner exactly what is collected, in plain language

<mark>An agent on someone's work laptop should be quiet, small, and easy to explain.</mark> It uses under 30MB of memory at idle and does nothing on battery saver. Every field it collects is listed in the tray app, because "what is this thing" is the first question anyone asks.

More once it ships.
