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
  - firstPage and lastPage: the page numbers (the n attribute) of the first and last page of the booklet's explanation of that measure. Leave out pages that hold only the measure's full legal text, and pages about other measures or the booklet in general.
