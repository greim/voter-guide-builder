<!--
  First structure call: find the measures in the booklet. The booklet's text
  follows the prompt, one <page> element per PDF page. The reply is JSON
  matching outlineSchema in src/stages/structure.ts.
-->
Below is the text of an official voter information booklet about ballot measures, one <page> element per PDF page. List what it covers:

- jurisdiction: the state or place the measures are for, e.g. "Colorado".
- election: the election year, e.g. "2026".
- measures: every ballot measure the booklet analyzes, in booklet order. For each:
  - label: its designation exactly as printed, e.g. "Amendment 81" or "Proposition NN".
  - title: its short title exactly as printed, e.g. "Constitutional Right to Hunt and Fish".
  - pages: the page numbers (the n attribute) of every page with something about this measure that a voter would read: its summary and analysis, arguments, fiscal impact, any quick-reference entry explaining a "yes" and "no" vote, and the page where its ballot title (the question on the ballot) is printed. These are often in separate parts of the booklet. Leave out pages that hold only the measure's full legal text, tables of contents, and pages about the booklet in general.
