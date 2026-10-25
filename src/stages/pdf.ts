import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright-core';

// Stage 8: the rendered page printed to PDF by headless Chrome, using the
// page's print CSS, the same as printing it from Chrome by hand.

/** Where printPdf writes the PDF: <out>/<out folder name>.pdf. */
export function pdfPath(outDir: string): string {
  return join(outDir, `${basename(resolve(outDir))}.pdf`);
}

/** Writes the PDF to pdfPath(outDir) and returns its path. */
export async function printPdf(outDir: string): Promise<string> {
  const file = pdfPath(outDir);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(outDir, 'index.html')).href, { waitUntil: 'load' });
    await page.pdf({
      path: file,
      // Chrome's print dialog defaults; an @page rule in main.css overrides them.
      format: 'Letter',
      margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
      preferCSSPageSize: true,
      // Like "Background graphics" in Chrome's print dialog: the heading icons
      // and YES/NO boxes are CSS backgrounds.
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
  return file;
}

/** The installed Chrome, else a Chromium from `npx playwright install chromium`. */
async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    try {
      return await chromium.launch();
    } catch {
      throw new Error(
        'pdf: no Chrome found. Install Google Chrome, or run `npx playwright install chromium`, then re-run.',
      );
    }
  }
}
