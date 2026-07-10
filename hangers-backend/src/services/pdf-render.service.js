const puppeteer = require('puppeteer');

const htmlToPDF = async (html, options = {}) => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (/^https?:\/\//i.test(url)) return request.abort();
      return request.continue();
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      ...options,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};

module.exports = {
  htmlToPDF,
};
