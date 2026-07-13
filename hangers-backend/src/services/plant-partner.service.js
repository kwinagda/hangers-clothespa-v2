const normalizePlantCode = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');

class PlantPartnerError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'PlantPartnerError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const requireActivePlantPartner = async (client, value) => {
  const code = normalizePlantCode(value);
  if (!code) throw new PlantPartnerError('PLANT_REQUIRED', 'Plant partner is required');
  const partner = await client.plantPartner.findUnique({ where: { code } });
  if (!partner) throw new PlantPartnerError('PLANT_NOT_FOUND', `Plant partner ${code} is not configured`);
  if (!partner.isActive) throw new PlantPartnerError('PLANT_INACTIVE', `Plant partner ${partner.name} is inactive`);
  return partner;
};

module.exports = { normalizePlantCode, PlantPartnerError, requireActivePlantPartner };
