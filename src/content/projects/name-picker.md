---
title: hand-drawn name picker
tag: personal
when: "2025"
published: 2025-03-15
summary: A random name picker that draws each name by hand, stroke by stroke, so picking someone feels less like a lottery.
links:
  - "[github](https://github.com/johnny-581)"
---

![the name picker writing out a name by hand, then the list of names to pick from](../images/name-picker-demo.mp4)
<small>each name is written out by hand; only checked names get picked.</small>

I manage the dev team at UX Hub. One problem I has was picking the right person


So I made one that writes the name instead. The pen wanders across the page for a moment, then commits to a first letter, and the name appears stroke by stroke in handwriting. It takes about two seconds. ==Slow enough to feel considered, fast enough that nobody waits.==

## how it works

- names are drawn with a single-line font, so each letter is a path the pen can trace rather than a filled shape
- the pen's wobble comes from a little noise on the path, plus a slight slant that changes per name
- the "thinking" scribble before each name is just the pen tracing a few random letters very lightly, then erasing them
- picked names fade to grey and go to the bottom, so nobody gets picked twice in a row

It's one HTML file with no build step, because the classroom computer would not let me install anything.

Students started asking to be picked so they could see their name drawn. That was not the outcome I expected from a presentation tool.
