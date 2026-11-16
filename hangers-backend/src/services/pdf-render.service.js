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

const validateInvoicePdfTarget = (targetUrl, allowedOriginValue) => {
  const target = new URL(targetUrl);
  const allowedOrigin = new URL(allowedOriginValue || target.origin).origin;
  if (target.origin !== allowedOrigin || !/^\/invoice\/[^/]+$/.test(target.pathname)) {
    throw new Error('Invoice PDF URL is outside the configured CRM invoice route');
  }
  return { target, allowedOrigin };
};

const urlToPDF = async (targetUrl, options = {}) => {
  const { target, allowedOrigin } = validateInvoicePdfTarget(targetUrl, options.allowedOrigin);

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
    await page.setViewport({ width: 1440, height: 1800, deviceScaleFactor: 1 });
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const requestUrl = new URL(request.url());
      return requestUrl.origin === allowedOrigin ? request.continue() : request.abort();
    });
    const response = await page.goto(target.toString(), { waitUntil: 'networkidle0', timeout: 30000 });
    if (!response || !response.ok()) throw new Error(`Invoice page returned HTTP ${response?.status() || 'unknown'}`);
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
      ...options.pdf,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};

module.exports = {
  htmlToPDF,
  urlToPDF,
  validateInvoicePdfTarget,
};
