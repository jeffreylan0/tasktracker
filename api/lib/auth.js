// File: api/lib/auth.js
const masterToken = process.env.USER_SECRET_TOKEN;

if (!masterToken) {
  console.warn("WARNING: USER_SECRET_TOKEN is not set. API will be insecure.");
}

export function validateToken(req) {
  const token = req.query.token || (req.body ? req.body.token : null);

  if (!masterToken) {
    return { isValid: false, error: 'API is not configured securely.' };
  }

  if (!token) {
    return { isValid: false, error: 'Authentication token is missing.' };
  }

  if (token !== masterToken) {
    return { isValid: false, error: 'Invalid authentication token.' };
  }

  return { isValid: true, error: null };
}
