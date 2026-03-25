/**
 * JWT Authentication Middleware for Art Bank Core
 * Protects API endpoints with JWT token validation
 */

import type { Context, Next } from 'hono';
import { verifyToken, type UserPayload } from '../lib/auth';
import type { Env } from '../types';

/**
 * Auth middleware - validates JWT token from Authorization header
 * Usage: app.use('/api/protected/*', authMiddleware)
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    // Extract token from Authorization header
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ 
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
        code: 'AUTH_REQUIRED'
      }, 401);
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify token
    const payload = await verifyToken(token);
    
    if (!payload) {
      return c.json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      }, 401);
    }
    
    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return c.json({ 
        error: 'Unauthorized',
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      }, 401);
    }
    
    // Attach user to context
    c.set('user', payload);
    
    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return c.json({ 
      error: 'Internal Server Error',
      message: 'Authentication failed',
      code: 'AUTH_ERROR'
    }, 500);
  }
}

/**
 * Role-based middleware - checks if user has required role
 * Usage: app.use('/api/admin/*', roleMiddleware(['admin']))
 */
export function roleMiddleware(allowedRoles: string[]) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get('user') as UserPayload;
    
    if (!user) {
      return c.json({ 
        error: 'Unauthorized',
        message: 'User not authenticated',
        code: 'AUTH_REQUIRED'
      }, 401);
    }
    
    if (!allowedRoles.includes(user.role)) {
      return c.json({ 
        error: 'Forbidden',
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      }, 403);
    }
    
    await next();
  };
}

/**
 * Optional auth middleware - validates token if present, but doesn't require it
 * Usage: app.use('/api/public/*', optionalAuthMiddleware)
 */
export async function optionalAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await verifyToken(token);
      
      if (payload) {
        const now = Math.floor(Date.now() / 1000);
        if (!payload.exp || payload.exp >= now) {
          c.set('user', payload);
        }
      }
    }
    
    await next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    await next();
  }
}

/**
 * Helper to get current user from context
 */
export function getCurrentUser(c: Context<{ Bindings: Env }>): UserPayload | null {
  return c.get('user') as UserPayload || null;
}
