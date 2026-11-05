---
title: whisk
tag: hackathon
when: "2026"
published: 2026-03-08
summary: "A Japanese AI language app: a live chat that manipulates the UI as you speak."
links:
  - "[devpost](https://devpost.com/software/whisk-o8x0b5)"
---

![whisk's video page with a vocabulary list, and a café practice scene with a word checklist, laid over a purple background](../images/whisk-app-overview.jpg)

[watch the demo](https://youtu.be/ehOObTde4LM?si=8GoAFnVaubaGwjVb)

## I lead a hackathon team

I joined the Gemini hackathon with some friends from UX Hub and found out I was the only developer on a team of designers. We pulled in more devs from UBC LunchPad, but suddenly everyone looked to me to lead. I took on the challenge.

## brainstorming

![a video call of the five team members during the Gemini 3 Hackathon, with the hackathon rules page shared on screen](../images/whisk-team-call.png)

Designing an app like this feels magical, like abstract shapes sharpening into something real. As the UX took shape on FigJam, I scoped our project components and assigned each developer a portion of the prototype.

![early brainstorm notes for a voice mode language practice app with Gemini: three characters acting out a scenario, video context, and audio features like greying out words once the user says them](../images/whisk-brainstorm-notes.png)
![a flow diagram from onboarding quiz to vocab extraction to a SQLite database, then to live chat and an optional quiz, with a difficulty level loop and a name on each box](../images/whisk-figjam-first-flow.png)
![a user flow diagram from clicking into a YouTube video, to subtitles and a vocabulary summary, to a stored vocabulary database, to reviewing it as flashcards or a podcast, with a Minecraft video screenshot as an example](../images/whisk-figjam-user-flow.png)

Prototyping early paid off. We swapped Notion/Anki APIs for SQLite. The Gemini Live API had echos, so we replaced it with Pipecat.

## building

```txt
frontend/
app/
├── (conversation)/
│   └── conversations/
│       └── [conversationId]/
├── (dashboard)/
│   ├── dashboard/
│   └── videos/
│       ├── [videoId]/
│       └── new/
├── (onboarding)/
└── api/
    └── ...
```

The hardest part of a 7-person team was collaboration. I set up the repo structure early so people wouldn't step on each other. The frontend split into three feature groups using Next.js route groups 👆

I primarily worked on the live chat feature, but also helped out wherever I could. I felt like I had to hold everything together - but the app was complex and feature-rich, and there was no way I could handle it all alone.

![the final architecture diagram: onboarding quiz, vocab extraction using Apify and Gemini 3 Flash, a SQLite database feeding a video dashboard and live chat, with live chat built on Pipecat, Gemini Live and Daily for WebRTC](../images/whisk-architecture.png)

![the whisk practice scene: a smiling character holding a coffee in a café, a Japanese speech bubble, and a checklist of vocabulary words with the ones already used crossed out](../images/whisk-practice-scene.png)

## deploying

A core feature of the app was extracting vocab from YouTube videos. Hours before the deadline, the YouTube Transcript API stopped working. Turns out YouTube actively blocks third-party APIs.

We scrambled through residential proxies before landing on an [Apify Actor](https://apify.com/topaz_sharingan/youtube-transcript-scraper) (a managed scraping service). It worked!

![a Railway service card for the whisk app showing it online, with an attached whisk-volume](../images/whisk-railway-deploy.png)

## reflection

This is my first time leading a hackathon team, and I learned a lot.

I feel like I had a tendency to want to control every detail, but the team actually did its best work when I stepped back and trusted people with their slices. Quang and Cherry designed the voice chat UI; Terry and Kat built the video dashboard. Those turned out to be some of the best parts of the app - things I could never have built on my own.

Three weeks of running online meetings, talking in the group chat, and contributing to features. For most of it I was quietly worried the project could fall apart. But here we are! We built something in three weeks that we’re truly proud of.
