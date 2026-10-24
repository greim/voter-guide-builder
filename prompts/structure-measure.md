<!--
  Second structure call, once per measure: the measure's pages as a PDF come
  first, then this prompt. The reply is JSON matching measureSchema in
  src/stages/structure.ts. {{label}}, {{title}}, {{firstPage}} and
  {{lastPage}} come from the outline call.
-->
The attached PDF is pages {{firstPage}} to {{lastPage}} of an official voter information booklet. They explain {{label}}: {{title}}. Transcribe that explanation into the JSON fields below.

Copy the booklet's words exactly. Don't summarize, reword, correct or add anything; voters will read this as the official text. Leave out page headers and footers, page numbers, the measure's full legal text, and anything about other measures.

- voteThreshold: the vote needed to pass, if the booklet states it (e.g. "Passes with 55% of the vote"), else "".
- ballotTitle: the question as it will appear on the ballot, if printed here, else "".
- summary: the text before the first heading, as Markdown, else "".
- voteYes and voteNo: if the booklet explains what a "yes" vote and a "no" vote mean, each of those statements verbatim, else "".
- sections: every remaining heading of the measure's explanation at the top level (e.g. "Summary and Analysis of {{label}}", "Arguments For", "Fiscal Impact"), in order, each with:
  - heading: as printed.
  - markdown: the section's text as Markdown. Write its subheadings as ### and any below those as ####. Use Markdown lists for lists and Markdown tables for tables, keeping every cell. Keep bold and italics. Where a chart, diagram or other graphic appears, write ![its caption](figure:N), where N is that figure's position in the figures list, starting at 1.
  Don't make a section for the YES/NO explanation; it goes in voteYes and voteNo.
- figures: each graphic you referenced, in order, with:
  - page: its page number within the attached PDF, starting at 1.
  - caption: its title or caption as printed.
  - section: the heading of the section it appears in.
  Don't list tables that you wrote as Markdown.
