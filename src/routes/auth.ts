// Authentication routes for Art Bank Platform
import { Hono } from 'hono';
import type { Env } from '../types';
import { 
  generateTokenPair, 
  generateUserId, 
  hashPassword, 
  verifyPassword,
  isValidEmail,
  isValidPassword,
  verifyToken,
  type UserPayload
} from '../lib/auth';
import { authMiddleware } from '../middleware/auth';

const auth = new Hono<{ Bindings: Env }>();

// ========== PUBLIC ROUTES ==========

/**
 * POST /api/auth/register
 * Register a new user
 */
auth.post('/register', async (c) => {
  try {
    const { email, password, role, full_name } = await c.req.json();
    
    // Validation
    if (!email || !password || !role) {
      return c.json(
        { error: 'Missing required fields: email, password, role' },
        400
      );
    }
    
    // Validate email
    if (!isValidEmail(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }
    
    // Validate password
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return c.json(
        { error: 'Invalid password', details: passwordValidation.errors },
        400
      );
    }
    
    // Validate role
    const allowedRoles = ['artist', 'collector', 'gallery', 'bank', 'expert', 'public'];
    if (!allowedRoles.includes(role)) {
      return c.json(
        { error: `Invalid role. Allowed: ${allowedRoles.join(', ')}` },
        400
      );
    }
    
    const db = c.env.DB;
    
    // Check if user already exists
    const existingUser = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();
    
    if (existingUser) {
      return c.json({ error: 'User with this email already exists' }, 409);
    }
    
    // Create user
    const userId = generateUserId();
    const passwordHash = await hashPassword(password);
    const now = Math.floor(Date.now() / 1000);
    
    await db
      .prepare(`
        INSERT INTO users (id, email, password_hash, role, full_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(userId, email, passwordHash, role, full_name || null, now, now)
      .run();
    
    // Generate tokens
    const tokenPayload: UserPayload = {
      user_id: userId,
      email,
      role,
    };
    
    const tokens = await generateTokenPair(tokenPayload);
    
    return c.json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: userId,
        email,
        role,
        full_name: full_name || null,
      },
      tokens,
    }, 201);
    
  } catch (error: any) {
    console.error('Registration error:', error);
    return c.json(
      { error: 'Registration failed', details: error.message },
      500
    );
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    if (!email || !password) {
      return c.json(
        { error: 'Missing required fields: email, password' },
        400
      );
    }
    
    const db = c.env.DB;
    
    // Find user
    const user = await db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first() as any;
    
    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }
    
    // Check if user is active
    if (!user.is_active) {
      return c.json({ error: 'Account is disabled' }, 403);
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }
    
    // Update last login
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
      .bind(now, user.id)
      .run();
    
    // Generate tokens
    const tokenPayload: UserPayload = {
      user_id: user.id,
      email: user.email,
      role: user.role,
      node_id: user.node_id,
    };
    
    const tokens = await generateTokenPair(tokenPayload);
    
    return c.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        node_id: user.node_id,
      },
      tokens,
    });
    
  } catch (error: any) {
    console.error('Login error:', error);
    return c.json(
      { error: 'Login failed', details: error.message },
      500
    );
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
auth.post('/refresh', async (c) => {
  try {
    const { refresh_token } = await c.req.json();
    
    if (!refresh_token) {
      return c.json({ error: 'Missing refresh_token' }, 400);
    }
    
    // Verify refresh token
    const payload = await verifyToken(refresh_token);
    
    if (!payload || payload.type !== 'refresh') {
      return c.json({ error: 'Invalid refresh token' }, 401);
    }
    
    const db = c.env.DB;
    
    // Get user
    const user = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(payload.user_id)
      .first() as any;
    
    if (!user || !user.is_active) {
      return c.json({ error: 'User not found or inactive' }, 401);
    }
    
    // Generate new tokens
    const tokenPayload: UserPayload = {
      user_id: user.id,
      email: user.email,
      role: user.role,
      node_id: user.node_id,
    };
    
    const tokens = await generateTokenPair(tokenPayload);
    
    return c.json({
      success: true,
      tokens,
    });
    
  } catch (error: any) {
    console.error('Refresh token error:', error);
    return c.json(
      { error: 'Token refresh failed', details: error.message },
      500
    );
  }
});

// ========== PROTECTED ROUTES ==========

/**
 * GET /api/auth/me
 * Get current user profile
 */
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('jwtPayload') as UserPayload;
  const db = c.env.DB;
  
  try {
    const userData = await db
      .prepare('SELECT id, email, role, full_name, node_id, is_verified, created_at, last_login_at FROM users WHERE id = ?')
      .bind(user.user_id)
      .first();
    
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    return c.json({ user: userData });
    
  } catch (error: any) {
    console.error('Get profile error:', error);
    return c.json(
      { error: 'Failed to get profile', details: error.message },
      500
    );
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
auth.put('/profile', authMiddleware, async (c) => {
  const user = c.get('jwtPayload') as UserPayload;
  const db = c.env.DB;
  
  try {
    const { full_name, node_id } = await c.req.json();
    const now = Math.floor(Date.now() / 1000);
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(full_name);
    }
    
    if (node_id !== undefined) {
      updates.push('node_id = ?');
      values.push(node_id);
    }
    
    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }
    
    updates.push('updated_at = ?');
    values.push(now);
    values.push(user.user_id);
    
    await db
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
    
    return c.json({
      success: true,
      message: 'Profile updated successfully',
    });
    
  } catch (error: any) {
    console.error('Update profile error:', error);
    return c.json(
      { error: 'Failed to update profile', details: error.message },
      500
    );
  }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
auth.post('/change-password', authMiddleware, async (c) => {
  const user = c.get('jwtPayload') as UserPayload;
  const db = c.env.DB;
  
  try {
    const { current_password, new_password } = await c.req.json();
    
    if (!current_password || !new_password) {
      return c.json(
        { error: 'Missing required fields: current_password, new_password' },
        400
      );
    }
    
    // Validate new password
    const passwordValidation = isValidPassword(new_password);
    if (!passwordValidation.valid) {
      return c.json(
        { error: 'Invalid new password', details: passwordValidation.errors },
        400
      );
    }
    
    // Get current password hash
    const userData = await db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(user.user_id)
      .first() as any;
    
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    // Verify current password
    const isValid = await verifyPassword(current_password, userData.password_hash);
    
    if (!isValid) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }
    
    // Hash new password
    const newPasswordHash = await hashPassword(new_password);
    const now = Math.floor(Date.now() / 1000);
    
    // Update password
    await db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(newPasswordHash, now, user.user_id)
      .run();
    
    return c.json({
      success: true,
      message: 'Password changed successfully',
    });
    
  } catch (error: any) {
    console.error('Change password error:', error);
    return c.json(
      { error: 'Failed to change password', details: error.message },
      500
    );
  }
});

export default auth;
