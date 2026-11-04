---
title: hand-drawn name picker
tag: personal
when: "2025"
published: 2025-03-15
summary: A random name picker that draws each name by hand, stroke by stroke, so picking someone feels less like a lottery.
links:
  - "[github](https://github.com/johnny-581)"
---

I was a TA for a first-year design course, and every week we picked students to present. The usual wheel-of-names site worked, but it felt like a game show. People flinched when it stopped.

So I made one that writes the name instead. The pen wanders across the page for a moment, then commits to a first letter, and the name appears stroke by stroke in handwriting. It takes about two seconds. <mark>Slow enough to feel considered, fast enough that nobody waits.</mark>

## how it works

- names are drawn with a single-line font, so each letter is a path the pen can trace rather than a filled shape
- the pen's wobble comes from a little noise on the path, plus a slight slant that changes per name
- the "thinking" scribble before each name is just the pen tracing a few random letters very lightly, then erasing them
- picked names fade to grey and go to the bottom, so nobody gets picked twice in a row

It's one HTML file with no build step, because the classroom computer would not let me install anything.

Students started asking to be picked so they could see their name drawn. That was not the outcome I expected from a presentation tool.
