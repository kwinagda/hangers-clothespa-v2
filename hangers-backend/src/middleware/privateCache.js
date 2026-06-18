const privateNoStore = (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Vary', 'Cookie');
  next();
};

module.exports = { privateNoStore };
