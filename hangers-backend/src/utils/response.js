// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE UTILS — Consistent API responses across all endpoints
// ─────────────────────────────────────────────────────────────────────────────

const success = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const created = (res, data = {}, message = 'Created successfully') => {
  return success(res, data, message, 201);
};

const error = (res, message = 'Something went wrong', statusCode = 500, errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

const unauthorized = (res, message = 'Unauthorized — please login') => {
  return error(res, message, 401);
};

const forbidden = (res, message = 'Access denied — insufficient permissions') => {
  return error(res, message, 403);
};

const notFound = (res, message = 'Resource not found') => {
  return error(res, message, 404);
};

const badRequest = (res, message = 'Invalid request', errors = null) => {
  return error(res, message, 400, errors);
};

module.exports = { success, created, error, unauthorized, forbidden, notFound, badRequest };
