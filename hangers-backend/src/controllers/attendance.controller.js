const prisma = require('../config/database');
const { success, badRequest, error, forbidden } = require('../utils/response');
const { attendanceActionSchema } = require('../validation/attendance.schemas');

const canManageAttendanceFor = (actor, targetStaffId) => {
  if (!actor || !targetStaffId) return false;
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'MANAGER') return true;
  return actor.id === targetStaffId;
};

const getAttendance = async (req, res) => {
  try {
    const { staffId, month, year } = req.query;
    const now = new Date();
    const m = parseInt(month || now.getMonth() + 1);
    const y = parseInt(year || now.getFullYear());

    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0, 23, 59, 59);

    const where = { date: { gte: start, lte: end } };
    if (staffId) where.staffId = staffId;

    const records = await prisma.attendance.findMany({ where, orderBy: { date: 'desc' } });
    res.json({ success: true, data: records });
  } catch (err) {
    return error(res, 'Failed to fetch attendance');
  }
};

const clockIn = async (req, res) => {
  try {
    const parsed = attendanceActionSchema.safeParse(req.body || {});
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid attendance payload');
    const staffId = parsed.data.staffId || req.staff?.id;
    if (!staffId) return badRequest(res, 'staffId is required');
    if (!canManageAttendanceFor(req.staff, staffId)) {
      return forbidden(res, 'You can only clock attendance for yourself');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findFirst({ where: { staffId, date: { gte: today } } });
    if (existing?.clockIn) return badRequest(res, 'Already clocked in today');

    const record = existing
      ? await prisma.attendance.update({ where: { id: existing.id }, data: { clockIn: new Date() } })
      : await prisma.attendance.create({ data: { staffId, clockIn: new Date() } });

    return success(res, record);
  } catch (err) {
    return error(res, 'Failed to clock in');
  }
};

const clockOut = async (req, res) => {
  try {
    const parsed = attendanceActionSchema.safeParse(req.body || {});
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid attendance payload');
    const staffId = parsed.data.staffId || req.staff?.id;
    if (!staffId) return badRequest(res, 'staffId is required');
    if (!canManageAttendanceFor(req.staff, staffId)) {
      return forbidden(res, 'You can only clock attendance for yourself');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.findFirst({
      where: { staffId, date: { gte: today }, clockIn: { not: null }, clockOut: null }
    });
    if (!record) return badRequest(res, 'No open clock-in found for today');

    const clockOutTime = new Date();
    const hours = (clockOutTime - record.clockIn) / (1000 * 60 * 60);

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data:  { clockOut: clockOutTime, hoursWorked: parseFloat(hours.toFixed(2)) }
    });
    return success(res, updated);
  } catch (err) {
    return error(res, 'Failed to clock out');
  }
};

module.exports = { getAttendance, clockIn, clockOut };
