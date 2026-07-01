import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

export function validateUUID(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const value = req.params[paramName];
    if (value && typeof value === 'string' && !isValidUUID(value)) {
      _res.status(400).json({ error: `Invalid ${paramName} format` });
      return;
    }
    next();
  };
}

const JWT_SECRET: string = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  groups?: Array<{ id: string; name: string }>;
}

declare module 'express' {
  interface Request {
    user?: JwtPayload;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  // Extract token: first try cookie, then Authorization header
  let token: string | undefined;

  if (req.cookies?.token) {
    token = req.cookies.token;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requirePermission(...actions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const hasPermission = actions.some(a => req.user!.permissions.includes(a));
    if (!hasPermission) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export { JWT_SECRET };
