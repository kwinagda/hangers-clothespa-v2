const puppeteer = require('puppeteer');

const htmlToPDF = async (html, options = {}) => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
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
