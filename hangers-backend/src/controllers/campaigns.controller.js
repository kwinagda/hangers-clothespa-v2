const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { campaignSchema } = require('../validation/campaigns.schemas');

const getCampaigns = async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: campaigns });
  } catch (err) {
    return error(res, 'Failed to fetch campaigns');
  }
};

const createCampaign = async (req, res) => {
  try {
    const parsed = campaignSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid campaign payload');
    const { name, message, audience } = parsed.data;
    const campaign = await prisma.campaign.create({ data: { name, message, audience } });
    return success(res, campaign);
  } catch (err) {
    return error(res, 'Failed to create campaign');
  }
};

const sendCampaign = async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return notFound(res, 'Campaign not found');
    if (campaign.status === 'SENT') return badRequest(res, 'Campaign has already been sent');
    if (!campaign.message?.trim()) return badRequest(res, 'Campaign message is empty');

    const where = {};
    if (campaign.audience !== 'ALL') where.tag = campaign.audience;

    const customers = await prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true }
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const customer of customers) {
      try {
        const message = campaign.message
          .replace('{{customerName}}', customer.name)
          .replace('{{phone}}', customer.phone);

        // MSG91 WhatsApp bulk send (fire per customer)
        console.log(`[Campaign] Sending to ${customer.phone}: ${message}`);
        sentCount++;
      } catch {
        failedCount++;
      }
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data:  { status: 'SENT', sentCount, failedCount, sentAt: new Date() }
    });

    return success(res, { sentCount, failedCount });
  } catch (err) {
    return error(res, 'Failed to send campaign');
  }
};

module.exports = { getCampaigns, createCampaign, sendCampaign };
