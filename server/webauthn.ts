import type { Request } from 'express';

const PRODUCTION_ORIGIN = 'https://qtecnico--lucasqvdo.replit.app';

function parseOrigin(value: string, allowHttp: boolean) {
  const url = new URL(value);
  if (!['https:', ...(allowHttp ? ['http:'] : [])].includes(url.protocol)) {
    throw new Error('WebAuthn origin must use HTTPS');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('WebAuthn origin must not contain a path');
  }
  return url;
}

export function getWebAuthnConfig(req: Request) {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredOrigin = process.env.PUBLIC_APP_URL?.trim();

  if (isProduction) {
    const origin = parseOrigin(configuredOrigin || PRODUCTION_ORIGIN, false);
    const requestOrigin = req.get('origin');
    if (requestOrigin && requestOrigin !== origin.origin) {
      throw new Error('Request origin does not match the configured public application origin');
    }
    return { origin: origin.origin, rpID: origin.hostname };
  }

  const requestOrigin = req.get('origin');
  if (requestOrigin) {
    const origin = parseOrigin(requestOrigin, true);
    return { origin: origin.origin, rpID: origin.hostname };
  }

  return { origin: 'http://localhost:5000', rpID: 'localhost' };
}

export function assertWebAuthnTransport(req: Request) {
  if (process.env.NODE_ENV !== 'production') return;
  const forwardedProto = req.get('x-forwarded-proto');
  const requestOrigin = req.get('origin');
  if (forwardedProto && forwardedProto.split(',')[0].trim() !== 'https') {
    throw new Error('WebAuthn requires HTTPS in production');
  }
  if (requestOrigin && !requestOrigin.startsWith('https://')) {
    throw new Error('WebAuthn requires HTTPS in production');
  }
}