import crypto from 'node:crypto';
import { DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';

const region = process.env.AWS_REGION || 'ap-south-1';
const dynamo = new DynamoDBClient({ region });
const sqs = new SQSClient({ region });

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': originForResponse(),
    'access-control-allow-methods': 'OPTIONS,POST',
    'access-control-allow-headers': 'content-type',
  },
  body: JSON.stringify(body),
});

const originForResponse = () => {
  const allowed = String(process.env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return allowed[0] || '*';
};

const parseBody = (event) => {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(raw);
};

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
};

const e164Phone = (value) => `91${normalizePhone(value)}`;
const nowEpoch = () => Math.floor(Date.now() / 1000);
const hashCode = (phone, code, nonce) => crypto.createHash('sha256').update(`${phone}:${code}:${nonce}`).digest('hex');
const publicError = (message) => json(400, { success: false, message });
const ddbString = (value) => ({ S: String(value || '') });
const ddbNumber = (value) => ({ N: String(Number(value || 0)) });
const readOtpItem = (item) => item ? {
  phone: item.phone?.S,
  codeHash: item.codeHash?.S,
  nonce: item.nonce?.S,
  attempts: Number(item.attempts?.N || 0),
  expiresAt: Number(item.expiresAt?.N || 0),
  cooldownUntil: Number(item.cooldownUntil?.N || 0),
} : null;

const requiredText = (body, key, min = 1) => String(body[key] || '').trim().length >= min;

const validatePickupBody = (body) => {
  const phone = normalizePhone(body.phone);
  if (!/^\d{10}$/.test(phone)) return 'Enter a valid 10-digit mobile number';
  if (!/^\d{6}$/.test(String(body.otp || '').trim())) return 'Enter the complete 6-digit OTP';
  if (!requiredText(body, 'name', 2)) return 'Enter your full name';
  if (!requiredText(body, 'addressLine1', 5)) return 'Enter flat, building and street';
  if (!requiredText(body, 'addressLine2', 2)) return 'Enter area or locality';
  if (!requiredText(body, 'city', 2)) return 'Enter city';
  if (!/^\d{6}$/.test(String(body.pincode || '').trim())) return 'Enter a valid 6-digit PIN code';
  if (!Array.isArray(body.items) || body.items.length === 0) return 'Select at least one pickup service';
  if (body.items.some((item) => !item?.serviceKey || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1)) return 'Pickup item quantity is invalid';
  return null;
};

const postTemplate = async ({ phone, templateName, templateParams, buttonParams, idempotencyKey }) => {
  const response = await fetch(process.env.WHATOMATE_TEMPLATE_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.WHATOMATE_API_KEY,
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      phone_number: e164Phone(phone),
      template_name: templateName,
      template_params: templateParams,
      button_params: buttonParams || {},
      account_name: process.env.WHATOMATE_ACCOUNT_NAME || 'Hangers',
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Whatomate ${response.status}: ${text.slice(0, 240)}`);
  }
};

const formatSchedule = (body) => [body.preferredDate, body.preferredSlot].filter(Boolean).join(', ') || 'Our team will contact you';
const formatItems = (items) => items.map((item) => `${item.serviceName || item.serviceKey}: ${item.quantity} pcs`).join(', ');
const formatAddress = (body) => [body.addressLine1, body.addressLine2, body.landmark, body.city, body.pincode].map((item) => String(item || '').trim()).filter(Boolean).join(', ');

const sendOtp = async (body) => {
  const phone = normalizePhone(body.phone);
  if (!/^\d{10}$/.test(phone)) return publicError('Enter a valid 10-digit mobile number');
  const existing = await dynamo.send(new GetItemCommand({ TableName: process.env.OTP_TABLE_NAME, Key: { phone: ddbString(phone) } }));
  const now = nowEpoch();
  const existingItem = readOtpItem(existing.Item);
  if (existingItem?.cooldownUntil && existingItem.cooldownUntil > now) {
    return publicError(`Please wait ${existingItem.cooldownUntil - now} seconds before requesting another code`);
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const nonce = crypto.randomUUID();
  await dynamo.send(new PutItemCommand({
    TableName: process.env.OTP_TABLE_NAME,
    Item: {
      phone: ddbString(phone),
      codeHash: ddbString(hashCode(phone, code, nonce)),
      nonce: ddbString(nonce),
      attempts: ddbNumber(0),
      expiresAt: ddbNumber(now + 600),
      cooldownUntil: ddbNumber(now + 60),
      createdAt: ddbString(new Date().toISOString()),
    },
  }));
  await postTemplate({
    phone,
    templateName: process.env.OTP_TEMPLATE_NAME || 'hangers_otp',
    templateParams: { '1': code },
    buttonParams: { '0': code },
    idempotencyKey: `public-pickup-otp:${phone}:${nonce}`,
  });
  return json(200, { success: true, message: 'Verification code sent on WhatsApp', data: { expiresIn: 600, cooldownSeconds: 60 } });
};

const submitPickup = async (body) => {
  const validationError = validatePickupBody(body);
  if (validationError) return publicError(validationError);
  const phone = normalizePhone(body.phone);
  const otp = String(body.otp || '').trim();
  const record = await dynamo.send(new GetItemCommand({ TableName: process.env.OTP_TABLE_NAME, Key: { phone: ddbString(phone) } }));
  const otpItem = readOtpItem(record.Item);
  if (!otpItem || otpItem.expiresAt < nowEpoch()) return publicError('OTP expired. Please request a new code.');
  if (otpItem.attempts >= 5) return publicError('Too many incorrect attempts. Please request a new code.');
  if (hashCode(phone, otp, otpItem.nonce) !== otpItem.codeHash) {
    const attempts = Number(otpItem.attempts || 0) + 1;
    await dynamo.send(new UpdateItemCommand({
      TableName: process.env.OTP_TABLE_NAME,
      Key: { phone: ddbString(phone) },
      UpdateExpression: 'SET attempts = :attempts',
      ExpressionAttributeValues: { ':attempts': ddbNumber(attempts) },
    }));
    return publicError(`Incorrect OTP. ${Math.max(0, 5 - attempts)} attempts remaining.`);
  }

  const externalRequestId = crypto.randomUUID();
  const requestNumber = `WEB-${externalRequestId.slice(0, 8).toUpperCase()}`;
  const payload = {
    externalSource: 'AWS_PUBLIC_PICKUP_INTAKE',
    externalRequestId,
    verifiedAt: new Date().toISOString(),
    phone,
    name: String(body.name || '').trim(),
    addressLine1: String(body.addressLine1 || '').trim(),
    addressLine2: String(body.addressLine2 || '').trim(),
    landmark: String(body.landmark || '').trim(),
    city: String(body.city || '').trim(),
    pincode: String(body.pincode || '').trim(),
    preferredDate: body.preferredDate || null,
    preferredSlot: body.preferredSlot || null,
    notes: String(body.notes || '').trim(),
    items: body.items.map((item) => ({ serviceKey: String(item.serviceKey), quantity: Number(item.quantity) })),
  };
  const pickupRequest = {
    ...payload,
    requestNumber,
    itemsSummary: formatItems(body.items),
    preferredSchedule: formatSchedule(body),
    address: formatAddress(body),
  };

  await postTemplate({
    phone,
    templateName: process.env.CUSTOMER_CONFIRMATION_TEMPLATE_NAME || 'hangers_crm_pickup_request_confirmed',
    templateParams: {
      '1': pickupRequest.name,
      '2': pickupRequest.requestNumber,
      '3': pickupRequest.itemsSummary,
      '4': pickupRequest.preferredSchedule,
      '5': pickupRequest.address,
    },
    idempotencyKey: `public-pickup-customer:${externalRequestId}`,
  });
  await postTemplate({
    phone: process.env.BUSINESS_ALERT_PHONE,
    templateName: process.env.BUSINESS_ALERT_TEMPLATE_NAME || 'hangers_crm_pickup_request_alert',
    templateParams: {
      '1': pickupRequest.requestNumber,
      '2': pickupRequest.name,
      '3': phone,
      '4': pickupRequest.itemsSummary,
      '5': pickupRequest.preferredSchedule,
      '6': pickupRequest.address,
    },
    idempotencyKey: `public-pickup-business:${externalRequestId}`,
  });
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.PICKUP_QUEUE_URL,
    MessageBody: JSON.stringify(payload),
  }));
  await dynamo.send(new DeleteItemCommand({ TableName: process.env.OTP_TABLE_NAME, Key: { phone: ddbString(phone) } }));
  return json(200, { success: true, message: 'Pickup request confirmed. Our team will contact you for the final collection time.', data: { request: { requestNumber } } });
};

const drainQueue = async () => {
  let imported = 0;
  const messages = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: process.env.PICKUP_QUEUE_URL,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 0,
    VisibilityTimeout: 60,
  }));
  for (const message of messages.Messages || []) {
    const body = JSON.parse(message.Body || '{}');
    const response = await fetch(process.env.CRM_INGEST_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pickup-ingest-secret': process.env.CRM_INGEST_SECRET,
      },
      body: JSON.stringify(body),
    }).catch((error) => ({ ok: false, status: 0, text: async () => error.message }));
    if (response.ok) {
      await sqs.send(new DeleteMessageCommand({ QueueUrl: process.env.PICKUP_QUEUE_URL, ReceiptHandle: message.ReceiptHandle }));
      imported += 1;
    }
  }
  return { imported, checked: (messages.Messages || []).length };
};

export const handler = async (event) => {
  try {
    if (event.source === 'aws.events') return await drainQueue();
    const method = event.requestContext?.http?.method || event.httpMethod;
    if (method === 'OPTIONS') return json(204, {});
    const path = event.rawPath || event.path || '';
    const body = parseBody(event);
    if (method === 'POST' && path.endsWith('/pickup-requests/send-otp')) return await sendOtp(body);
    if (method === 'POST' && path.endsWith('/pickup-requests')) return await submitPickup(body);
    return json(404, { success: false, message: 'Not found' });
  } catch (error) {
    console.error('Public pickup intake error:', error);
    return json(500, { success: false, message: 'Pickup service is temporarily unavailable. Please call or WhatsApp the store.' });
  }
};
