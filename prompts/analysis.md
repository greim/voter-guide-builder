<!--
  The prompt used for each measure's analysis. Adapted from the one used by
  hand for the Colorado 2026 guide (quoted in that guide's Analyses section).
  {{jurisdiction}}, {{election}} and {{measure}} are filled in by the analyze
  stage; the measure's official text from the booklet follows the prompt.
  Whether Claude may search the web is set by --web-searches, and
  analysis-format.md tells Claude which, so this prompt doesn't need to.
-->
Help me analyze {{jurisdiction}} {{election}} state ballot initiatives in an unbiased way. Below is {{measure}}, exactly as it appears in the official voter guide, and you provide an analysis. I want to know what the initiative does, who's pushing for it and why, who's opposing it and why, who benefits and who's negatively impacted, any possible side effects or unintended consequences, and any other pros or cons. If the initiative is strongly aligned with an ideology, I'd like to know. Mainly I just want a nuts-and-bolts, unbiased analysis.
