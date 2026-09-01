const LOCKED_DAILY_IRON_BILL_STATUSES = new Set(['SENT', 'PAID', 'PARTIAL']);

const isLockedDailyIronBill = (bill) => LOCKED_DAILY_IRON_BILL_STATUSES.has(String(bill?.status || '').toUpperCase());
const isReusableDailyIronDraftBill = (bill) => String(bill?.status || '').toUpperCase() === 'DRAFT';

const resolveDailyIronBillMode = (billsForPeriod = []) => {
  const bills = Array.isArray(billsForPeriod) ? billsForPeriod : [];
  const draftBill = bills.find(isReusableDailyIronDraftBill) || null;
  const lockedBills = bills.filter(isLockedDailyIronBill);
  return {
    existingDraftBill: draftBill,
    lockedBills,
    mode: draftBill ? 'REGENERATED_DRAFT' : lockedBills.length ? 'SUPPLEMENTAL' : 'NEW_PERIOD_BILL',
  };
};

module.exports = {
  LOCKED_DAILY_IRON_BILL_STATUSES,
  isLockedDailyIronBill,
  isReusableDailyIronDraftBill,
  resolveDailyIronBillMode,
};
