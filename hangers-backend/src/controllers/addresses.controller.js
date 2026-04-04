// ─────────────────────────────────────────────────────────────────────────────
// ADDRESSES CONTROLLER — Customer app addresses backed by the CRM Address table
// Routes: /api/v1/addresses  (customerAuth protected)
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');
const { success, created, error, badRequest, notFound } = require('../utils/response');

const formatAddress = (address) => ({
  id: address.id,
  label: address.label,
  address: [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.city,
    address.pincode,
  ].filter(Boolean).join(', '),
  addressLine1: address.addressLine1,
  addressLine2: address.addressLine2,
  landmark: address.landmark,
  city: address.city,
  pincode: address.pincode,
  latitude: address.latitude,
  longitude: address.longitude,
  isDefault: address.isDefault,
  createdAt: address.createdAt,
});

const parseAddressInput = (body) => {
  const rawAddress = body.address?.trim();
  const line1 = body.addressLine1?.trim() || rawAddress || '';
  const line2 = body.addressLine2?.trim() || null;
  const landmark = body.landmark?.trim() || null;
  const city = body.city?.trim() || '';
  const pincode = body.pincode?.trim() || '';

  return {
    label: body.label?.trim() || 'Home',
    addressLine1: line1,
    addressLine2: line2,
    landmark,
    city,
    pincode,
    latitude: body.latitude !== undefined ? Number(body.latitude) : null,
    longitude: body.longitude !== undefined ? Number(body.longitude) : null,
  };
};

const getAddresses = async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { customerId: req.customer.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return success(res, { addresses: addresses.map(formatAddress) });
  } catch (err) {
    console.error('getAddresses:', err);
    return error(res, 'Failed to fetch addresses');
  }
};

const createAddress = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const payload = parseAddressInput(req.body);

    if (!payload.addressLine1) {
      return badRequest(res, 'Address is required');
    }

    const existingCount = await prisma.address.count({ where: { customerId } });
    const makeDefault = req.body.setAsDefault || existingCount === 0;

    if (makeDefault) {
      await prisma.address.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        customerId,
        ...payload,
        isDefault: makeDefault,
      },
    });

    return created(res, { address: formatAddress(address) }, 'Address saved');
  } catch (err) {
    console.error('createAddress:', err);
    return error(res, 'Failed to save address');
  }
};

const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.customer.id;
    const existing = await prisma.address.findFirst({ where: { id, customerId } });

    if (!existing) return notFound(res, 'Address not found');

    const payload = parseAddressInput({
      ...existing,
      ...req.body,
      address: req.body.address ?? [
        existing.addressLine1,
        existing.addressLine2,
        existing.landmark,
        existing.city,
        existing.pincode,
      ].filter(Boolean).join(', '),
    });

    if (!payload.addressLine1) {
      return badRequest(res, 'Address is required');
    }

    const updated = await prisma.address.update({
      where: { id },
      data: payload,
    });

    return success(res, { address: formatAddress(updated) }, 'Address updated');
  } catch (err) {
    console.error('updateAddress:', err);
    return error(res, 'Failed to update address');
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.customer.id;

    const existing = await prisma.address.findFirst({ where: { id, customerId } });
    if (!existing) return notFound(res, 'Address not found');

    await prisma.address.updateMany({
      where: { customerId, isDefault: true },
      data: { isDefault: false },
    });

    const updated = await prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });

    return success(res, { address: formatAddress(updated) }, 'Default address updated');
  } catch (err) {
    console.error('setDefaultAddress:', err);
    return error(res, 'Failed to set default');
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.customer.id;

    const existing = await prisma.address.findFirst({ where: { id, customerId } });
    if (!existing) return notFound(res, 'Address not found');

    await prisma.address.delete({ where: { id } });

    if (existing.isDefault) {
      const next = await prisma.address.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'asc' },
      });

      if (next) {
        await prisma.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return success(res, {}, 'Address deleted');
  } catch (err) {
    console.error('deleteAddress:', err);
    return error(res, 'Failed to delete address');
  }
};

module.exports = { getAddresses, createAddress, updateAddress, setDefaultAddress, deleteAddress };
