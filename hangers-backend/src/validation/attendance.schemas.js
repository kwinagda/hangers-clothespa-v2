const { z } = require('zod');

const attendanceActionSchema = z.object({
  staffId: z.string().trim().min(1).optional(),
}).strict();

module.exports = { attendanceActionSchema };
