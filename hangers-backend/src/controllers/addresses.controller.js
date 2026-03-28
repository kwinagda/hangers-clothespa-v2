// ─────────────────────────────────────────────────────────────────────────────
// ADDRESSES CONTROLLER — Saved pickup addresses for customers
// Routes: /api/v1/addresses  (customerAuth protected)
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── GET /api/v1/addresses — All saved addresses for this customer ─────────────
const getAddresses = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const addresses  = await prisma.customerAddress.findMany({
      where:   { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, addresses });
  } catch (err) {
    console.error('getAddresses:', err);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
};

// ── POST /api/v1/addresses — Save a new address ───────────────────────────────
const createAddress = async (req, res) => {
  try {
    const customerId            = req.customer.id;
    const { label = 'Home', address, setAsDefault = false } = req.body;

    if (!address || !address.trim()) {
      return res.status(400).json({ error: 'Address is required' });
    }

    // Check if this is the first address — make it default automatically
    const existingCount = await prisma.customerAddress.count({ where: { customerId } });
    const makeDefault   = setAsDefault || existingCount === 0;

    // If making default, clear current default first
    if (makeDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerId, isDefault: true },
        data:  { isDefault: false },
      });
    }

    const newAddress = await prisma.customerAddress.create({
      data: {
        customerId,
        label:     label.trim(),
        address:   address.trim(),
        isDefault: makeDefault,
      },
    });

    res.status(201).json({ success: true, address: newAddress });
  } catch (err) {
    console.error('createAddress:', err);
    res.status(500).json({ error: 'Failed to save address' });
  }
};

// ── PATCH /api/v1/addresses/:id — Update a saved address ─────────────────────
const updateAddress = async (req, res) => {
  try {
    const { id }       = req.params;
    const customerId   = req.customer.id;
    const { label, address } = req.body;

    const existing = await prisma.customerAddress.findFirst({
      where: { id, customerId },
    });
    if (!existing) return res.status(404).json({ error: 'Address not found' });

    const updated = await prisma.customerAddress.update({
      where: { id },
      data:  {
        ...(label   ? { label:   label.trim()   } : {}),
        ...(address ? { address: address.trim() } : {}),
      },
    });

    res.json({ success: true, address: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update address' });
  }
};

// ── PATCH /api/v1/addresses/:id/default — Set as default ─────────────────────
const setDefaultAddress = async (req, res) => {
  try {
    const { id }     = req.params;
    const customerId = req.customer.id;

    const existing = await prisma.customerAddress.findFirst({
      where: { id, customerId },
    });
    if (!existing) return res.status(404).json({ error: 'Address not found' });

    // Clear all defaults for this customer
    await prisma.customerAddress.updateMany({
      where: { customerId, isDefault: true },
      data:  { isDefault: false },
    });

    // Set new default
    const updated = await prisma.customerAddress.update({
      where: { id },
      data:  { isDefault: true },
    });

    res.json({ success: true, address: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set default' });
  }
};

// ── DELETE /api/v1/addresses/:id — Delete a saved address ────────────────────
const deleteAddress = async (req, res) => {
  try {
    const { id }     = req.params;
    const customerId = req.customer.id;

    const existing = await prisma.customerAddress.findFirst({
      where: { id, customerId },
    });
    if (!existing) return res.status(404).json({ error: 'Address not found' });

    await prisma.customerAddress.delete({ where: { id } });

    // If we deleted the default, promote the oldest remaining address
    if (existing.isDefault) {
      const next = await prisma.customerAddress.findFirst({
        where:   { customerId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await prisma.customerAddress.update({
          where: { id: next.id },
          data:  { isDefault: true },
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete address' });
  }
};

module.exports = { getAddresses, createAddress, updateAddress, setDefaultAddress, deleteAddress };
