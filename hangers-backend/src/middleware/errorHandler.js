// ─────────────────────────────────────────────────────────────────────────────
// ERROR HANDLER MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

const errorHandler = (err, req, res, next) => {
  // Prisma unique constraint
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this information already exists.',
      field:   err.meta?.target,
    });
  }
  // Prisma record not found
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found.',
    });
  }
  // Zod validation errors (thrown from asyncHandler-wrapped routes)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;
  const message = isServerError && process.env.NODE_ENV !== 'development'
    ? 'Internal server error'
    : (err.message || 'Internal server error');

  // Structured error log — always log server errors, dev logs everything
  if (isServerError || process.env.NODE_ENV === 'development') {
    const logEntry = {
      level:      'error',
      method:     req.method,
      path:       req.originalUrl,
      statusCode,
      message:    err.message,
      actorId:    req.staff?.id || req.customer?.id || null,
      actorType:  req.staff ? 'staff' : req.customer ? 'customer' : 'unknown',
      requestId:  req.headers['x-request-id'] || null,
      stack:      process.env.NODE_ENV === 'development' ? err.stack : undefined,
    };
    console.error(JSON.stringify(logEntry));
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
