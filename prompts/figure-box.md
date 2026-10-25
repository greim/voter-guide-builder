<!--
  Sent with an image of one booklet page, once per figure; the reply is JSON
  matching boxSchema in src/stages/figures.ts. {{caption}} comes from the
  structure stage. Code tightens the box afterwards, so it can be rough, but
  what it leaves out (the caption, body text) must stay outside it.
-->
This image is a page of an official voter information booklet. Find the graphic (chart, diagram or picture) with the caption "{{caption}}".

Give the box around the graphic in pixels of this image: left, top, right and bottom edges. Include everything that belongs to the graphic, such as axis labels, legends, notes and a subtitle giving units. Leave out its caption ("Figure 1" and its title), which the guide prints separately, and the page's body text, headings, headers and footers.

If no such graphic is on this page, set found to false and the edges to 0.
