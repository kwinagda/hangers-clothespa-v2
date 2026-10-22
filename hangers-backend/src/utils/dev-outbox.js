const shouldRunDevOutbox = ({ isProduction, workerEnabled, homeOnly, razorpayKeyId }) => (
  !isProduction && workerEnabled === 'true' && homeOnly === 'true'
  && String(razorpayKeyId || '').startsWith('rzp_test_')
);

module.exports = { shouldRunDevOutbox };
