/**
 * Admin Role Middleware
 * 
 * Ensures only users with 'admin' role can access protected routes
 * Must be used after authMiddleware
 */

import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * Admin role middleware
 * Checks if authenticated user has admin role
 */
export async function adminMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get('user'); // Changed from jwtPayload to user
  
  // Check if user is authenticated
  if (!user) {
    return c.json({
      error: 'Unauthorized',
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    }, 401);
  }
  
  // Check if user has admin role
  if (user.role !== 'admin') {
    return c.json({
      error: 'Forbidden',
      message: 'Admin access required',
      code: 'ADMIN_REQUIRED',
      userRole: user.role
    }, 403);
  }
  
  await next();
}

/**
 * Admin or specific roles middleware
 * Allows admin or specified roles to access
 */
export function adminOrRolesMiddleware(allowedRoles: string[]) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get('user'); // Changed from jwtPayload to user
    
    if (!user) {
      return c.json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }, 401);
    }
    
    // Admin has access to everything
    if (user.role === 'admin') {
      await next();
      return;
    }
    
    // Check if user role is in allowed roles
    if (!allowedRoles.includes(user.role)) {
      return c.json({
        error: 'Forbidden',
        message: `Access restricted to: ${allowedRoles.join(', ')} or admin`,
        code: 'INSUFFICIENT_PERMISSIONS',
        userRole: user.role
      }, 403);
    }
    
    await next();
  };
}
