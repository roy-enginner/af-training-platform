// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://af-training.netlify.app',
  'https://training.assist-frontier.site',
]

// Add localhost for development
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3000')
}

export function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  }
}

export function createPreflightResponse(origin?: string) {
  return {
    statusCode: 204,
    headers: getCorsHeaders(origin),
    body: '',
  }
}
