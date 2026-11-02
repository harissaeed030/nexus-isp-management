export function errorHandler(error, _req, res, _next) {
  console.error(error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({
    success: false,
    error: status >= 500 ? "Internal server error" : error.message
  });
}
