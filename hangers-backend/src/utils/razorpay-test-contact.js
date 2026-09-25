const getRazorpayTestContact = ({ mode, configuredContact }) => {
  if (mode !== 'TEST') return null;
  const digits = String(configuredContact || '').replace(/\D/g, '');
  return digits === '9930367267' ? `+91${digits}` : null;
};

module.exports = { getRazorpayTestContact };
