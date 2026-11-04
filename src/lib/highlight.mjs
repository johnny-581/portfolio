// Obsidian's ==highlight== becomes <mark>, the same as writing <mark> by hand. A Sätteri plugin,
// Astro's Markdown processor. Only within one run of plain text: ==**bold**== or a highlight
// across a line break stays as written.
const HIGHLIGHT = /==([^=\n]+?)==/g;

export const highlight = {
  name: "highlight",
  text(node, ctx) {
    const { value } = node;
    const parts = [];
    let last = 0;
    for (const match of value.matchAll(HIGHLIGHT)) {
      if (match.index > last) parts.push({ type: "text", value: value.slice(last, match.index) });
      parts.push({ type: "html", value: "<mark>" }, { type: "text", value: match[1] }, { type: "html", value: "</mark>" });
      last = match.index + match[0].length;
    }
    if (!parts.length) return;
    if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
    ctx.replaceNode(node, parts);
  },
};
