const { z } = require('zod');
const { REPORT_TYPES } = require('../config/master-data');

const reportQuerySchema = z.object({
  type: z.enum(REPORT_TYPES.map((report) => report.value)),
  from: z.string().trim().optional(),
  to:   z.string().trim().optional(),
}).strict();

module.exports = { reportQuerySchema };
