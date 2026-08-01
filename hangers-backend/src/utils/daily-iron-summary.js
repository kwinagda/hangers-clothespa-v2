const formatRate = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  return amount % 1 === 0 ? String(amount) : amount.toFixed(2);
};

const formatDailyIronLogItems = (logs = []) => {
  const activeLogs = Array.isArray(logs) ? logs.filter(Boolean) : [];
  const serviceRateCount = activeLogs.reduce((map, log) => {
    const key = String(log.serviceName || 'Daily Iron');
    const rates = map.get(key) || new Set();
    rates.add(formatRate(log.ratePerPiece));
    map.set(key, rates);
    return map;
  }, new Map());

  return activeLogs
    .map((log) => {
      const serviceName = log.serviceName || 'Daily Iron';
      const pieces = Number(log.pieces || 0);
      const rateText = formatRate(log.ratePerPiece);
      const hasRateConflict = (serviceRateCount.get(serviceName)?.size || 0) > 1;
      return `${serviceName} x${pieces}${hasRateConflict ? ` @ Rs ${rateText}` : ''}`;
    })
    .join(', ');
};

module.exports = {
  formatDailyIronLogItems,
};
