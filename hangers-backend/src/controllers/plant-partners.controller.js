const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { normalizePlantCode } = require('../services/plant-partner.service');

const normalizePayload = (body, { requireCode = false } = {}) => {
  const code = body.code === undefined ? undefined : normalizePlantCode(body.code);
  const name = body.name === undefined ? undefined : String(body.name || '').trim();
  if (requireCode && !code) throw new Error('CODE_REQUIRED');
  if (requireCode && !name) throw new Error('NAME_REQUIRED');
  const paymentTermsDays = body.paymentTermsDays === undefined ? undefined : Number(body.paymentTermsDays);
  if (paymentTermsDays !== undefined && (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365)) {
    throw new Error('INVALID_PAYMENT_TERMS');
  }
  const optional = (key, max) => body[key] === undefined
    ? undefined
    : (String(body[key] || '').trim().slice(0, max) || null);
  return {
    ...(code !== undefined ? { code } : {}),
    ...(name !== undefined ? { name } : {}),
    legalName: optional('legalName', 200),
    gstin: optional('gstin', 15)?.toUpperCase(),
    contactName: optional('contactName', 120),
    phone: optional('phone', 20),
    email: optional('email', 160)?.toLowerCase(),
    address: optional('address', 500),
    notes: optional('notes', 500),
    ...(paymentTermsDays !== undefined ? { paymentTermsDays } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive === true } : {}),
  };
};

const listPlantPartners = async (_req, res) => {
  try {
    const partners = await prisma.plantPartner.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return success(res, partners);
  } catch (_err) {
    return error(res, 'Failed to fetch plant partners');
  }
};

const createPlantPartner = async (req, res) => {
  try {
    const data = normalizePayload(req.body, { requireCode: true });
    const partner = await prisma.$transaction(async (tx) => {
      const created = await tx.plantPartner.create({ data });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'PLANT_PARTNER_CREATED', resource: 'plant_partner', resourceId: created.id,
        description: `${created.code} plant partner created`, metadata: { code: created.code, name: created.name },
        ...getRequestMeta(req),
      });
      return created;
    });
    return success(res, partner, 'Plant partner created', 201);
  } catch (err) {
    if (err.message === 'CODE_REQUIRED') return badRequest(res, 'Plant code is required');
    if (err.message === 'NAME_REQUIRED') return badRequest(res, 'Plant name is required');
    if (err.message === 'INVALID_PAYMENT_TERMS') return badRequest(res, 'Payment terms must be 0-365 days');
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Plant code already exists' });
    return error(res, 'Failed to create plant partner');
  }
};

const updatePlantPartner = async (req, res) => {
  try {
    const { code: _ignoredCode, ...data } = normalizePayload(req.body);
    if (data.name !== undefined && !data.name) return badRequest(res, 'Plant name cannot be empty');
    const partner = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM plant_partners WHERE "id" = ${req.params.id} FOR UPDATE`;
      const existing = await tx.plantPartner.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new Error('PLANT_NOT_FOUND');
      const updated = await tx.plantPartner.update({ where: { id: existing.id }, data });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff.id, actorName: req.staff.name,
        action: 'PLANT_PARTNER_UPDATED', resource: 'plant_partner', resourceId: existing.id,
        description: `${existing.code} plant partner updated`,
        metadata: { changedFields: Object.keys(data), isActive: updated.isActive }, ...getRequestMeta(req),
      });
      return updated;
    });
    return success(res, partner, 'Plant partner updated');
  } catch (err) {
    if (err.message === 'PLANT_NOT_FOUND') return notFound(res, 'Plant partner not found');
    if (err.message === 'INVALID_PAYMENT_TERMS') return badRequest(res, 'Payment terms must be 0-365 days');
    return error(res, 'Failed to update plant partner');
  }
};

module.exports = { listPlantPartners, createPlantPartner, updatePlantPartner };
