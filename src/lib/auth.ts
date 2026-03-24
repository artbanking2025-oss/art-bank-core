// JWT Authentication utilities for Art Bank Platform
import { sign, verify } from 'hono/jwt'
import type { JWTPayload } from 'hono/utils/jwt/types'

// JWT configuration
// WARNING: Change JWT_SECRET in production via environment variable
export const JWT_SECRET = 'art-bank-secret-key-change-in-production-v1-2024';
export const JWT_EXPIRES_IN = 60 * 60 * 24; // 24 hours
export const REFRESH_TOKEN_EXPIRES_IN = 60 * 60 * 24 * 7; // 7 days

export interface UserPayload extends JWTPayload {
  user_id: string;
  email: string;
  role: string;
  node_id?: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Generate JWT access token
 */
export async function generateAccessToken(payload: UserPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  return await sign(
    {
      ...payload,
      iat: now,
      exp: now + JWT_EXPIRES_IN,
    },
    JWT_SECRET
  );
}

/**
 * Generate JWT refresh token
 */
export async function generateRefreshToken(payload: UserPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  return await sign(
    {
      user_id: payload.user_id,
      email: payload.email,
      type: 'refresh',
      iat: now,
      exp: now + REFRESH_TOKEN_EXPIRES_IN,
    },
    JWT_SECRET
  );
}

/**
 * Generate both access and refresh tokens
 */
export async function generateTokenPair(payload: UserPayload): Promise<TokenPair> {
  const access_token = await generateAccessToken(payload);
  const refresh_token = await generateRefreshToken(payload);
  
  return {
    access_token,
    refresh_token,
    expires_in: JWT_EXPIRES_IN,
  };
}

/**
 * Verify JWT token
 */
export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const payload = await verify(token, JWT_SECRET);
    return payload as UserPayload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Hash password using Web Crypto API (Cloudflare Workers compatible)
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify password
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

/**
 * Generate random user ID
 */
export function generateUserId(): string {
  return `user-${crypto.randomUUID()}`;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
