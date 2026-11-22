---
title: pepper docs
tag: shipped
when: 2026-
published: 2026-11-01
summary: A Notion-like rich text editor for any PDF document.
links:
  - "[pepperdocs.app](https://pepperdocs.app)"
---

![pepper docs: asking the chat to open three documents, then switching between them on the desk](../images/pepper-docs-desk.mp4)
<small>ask for documents and they land on your desk, a click apart.</small>

I like Notion because of it's intuitiveness (`-` + `space` creates a bullet item) and flexibility (combine any blocks, page inside page).

==I wanted to build something like notion but for resume's and cover letters.==

The idea is this:
[image]

There are some unique problems that a block-based editor has to solve to accommodate a pdf document like resume
- there is an unknown number of sections and entries so I can't have a placeholder for every entry, or I have to add a placeholder to the style every time I add an entry to the editor.
	- solved by `reapeats`, an extensible and drag-and-droppable structure defined in the style
- There are two column resumes, three column resumes, resume's with wired layouts
	- solved by giving the editor basic building blocks, and allow them to be freely composed like lego (similar to how notion works). opinionated editor, un-opinionated (PDF) output
		- field, list, inline list, repeat

## Mistakes I made and fixed

==making it to complicated==

If there's one thing that this project taught me then that would be 

==latex vs typst==



![pepper docs: dragging the education section below experience while the PDF preview updates](../images/pepper-docs-drag-section.mp4)
<small>drag a whole entry, or a whole section, and the PDF reflows.</small>

more info to come!

![pepper docs: hovering the LinkedIn link on a resume to copy or unlink it, then editing its text and URL](../images/pepper-docs-edit-link.mp4)
<small>hover a link to copy or remove it, or edit its text and url in place.</small>

![pepper docs: typing "show me johnny's resume" into the chat, which finds the document and opens it](../images/pepper-docs-open-from-chat.mp4)
<small>ask for a document by name and the chat finds it and opens it.</small>

![pepper docs: asking the chat to swap education and experience, which edits the resume and highlights the moved section](../images/pepper-docs-chat-edit.mp4)
<small>ask for a change and the chat edits the document, with the change highlighted.</small>

![A diagram of how pepper docs fits together: AI writes the content as JSON into the editor, the editor structure as JSON, and the style as Typst for the PDF. The editor renders to the PDF instantly, and the PDF feeds measured text styles, colour and spacing back to the editor](../images/pepper-docs-architecture-diagram.png)
<small>content, editor structure and style are three separate files, and the PDF tells the editor how to look.</small>
