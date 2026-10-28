const shouldRunDevOutbox = ({ isProduction, workerEnabled }) => (
  !isProduction && workerEnabled === 'true'
);

module.exports = { shouldRunDevOutbox };
