// Authentication middleware for Hono
import type { Context, Next } from 'hono';
import { jwt } from 'hono/jwt';
import { JWT_SECRET, type UserPayload } from '../lib/auth';

/**
 * Auth middleware - uses Hono's built-in JWT middleware
 */
export const authMiddleware = jwt({
  secret: JWT_SECRET,
  alg: 'HS256', // REQUIRED: specify algorithm
});

/**
 * Role-based authorization middleware
 */
export function requireRole(...allowedRoles: string[]) {
  return async (c: Context, next: Next) => {
    const payload = c.get('jwtPayload') as UserPayload;
    
    if (!payload) {
      return c.json(
        { 
          error: 'Unauthorized', 
          message: 'Authentication required' 
        }, 
        401
      );
    }
    
    if (!allowedRoles.includes(payload.role)) {
      return c.json(
        { 
          error: 'Forbidden', 
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}` 
        }, 
        403
      );
    }
    
    // Also set 'user' for compatibility
    c.set('user', payload);
    
    await next();
  };
}

/**
 * Optional auth middleware - doesn't block if no token, but attaches user if present
 */
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Try to use jwt middleware
    try {
      await authMiddleware(c, next);
      return;
    } catch (error) {
      // Continue without auth
    }
  }
  
  await next();
}
