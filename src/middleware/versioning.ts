/**
 * API Versioning System
 * 
 * Provides backward-compatible API versioning with:
 * - URL-based versioning (/api/v1/*, /api/v2/*)
 * - Version validation middleware
 * - Deprecation warnings
 * - Version negotiation
 */

import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * Supported API versions
 */
export const API_VERSIONS = {
  V1: 'v1',
  V2: 'v2'
} as const;

export type ApiVersion = typeof API_VERSIONS[keyof typeof API_VERSIONS];

/**
 * Current API version (latest)
 */
export const CURRENT_VERSION: ApiVersion = API_VERSIONS.V2;

/**
 * Deprecated versions with sunset dates
 */
export const DEPRECATED_VERSIONS: Record<string, string> = {
  [API_VERSIONS.V1]: '2026-12-31' // Sunset date for v1
};

/**
 * Version information
 */
export interface VersionInfo {
  version: ApiVersion;
  isDeprecated: boolean;
  sunsetDate?: string;
  message?: string;
}

/**
 * Extract API version from request path
 */
export function extractVersion(path: string): ApiVersion | null {
  const match = path.match(/^\/api\/(v\d+)\//);
  if (!match) return null;
  
  const version = match[1] as ApiVersion;
  if (!Object.values(API_VERSIONS).includes(version)) {
    return null;
  }
  
  return version;
}

/**
 * Get version information
 */
export function getVersionInfo(version: ApiVersion): VersionInfo {
  const isDeprecated = version in DEPRECATED_VERSIONS;
  const sunsetDate = DEPRECATED_VERSIONS[version];
  
  let message: string | undefined;
  if (isDeprecated) {
    message = `API ${version} is deprecated and will be sunset on ${sunsetDate}. Please migrate to ${CURRENT_VERSION}.`;
  }
  
  return {
    version,
    isDeprecated,
    sunsetDate,
    message
  };
}

/**
 * Version validation middleware
 */
export function versionMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const path = c.req.path;
    
    // Skip if not an API endpoint
    if (!path.startsWith('/api/')) {
      return next();
    }
    
    const version = extractVersion(path);
    
    // If no version in path, default to current version
    if (!version) {
      // Allow unversioned endpoints (backward compatibility)
      return next();
    }
    
    // Store version in context
    c.set('apiVersion', version);
    
    // Get version info
    const versionInfo = getVersionInfo(version);
    
    // Add version headers
    c.header('X-API-Version', version);
    c.header('X-API-Current-Version', CURRENT_VERSION);
    
    // Add deprecation warning if needed
    if (versionInfo.isDeprecated) {
      c.header('Deprecation', 'true');
      c.header('Sunset', versionInfo.sunsetDate || 'unknown');
      c.header('Link', `</api/${CURRENT_VERSION}>; rel="successor-version"`);
      
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Deprecated API version used',
        version,
        sunsetDate: versionInfo.sunsetDate,
        userAgent: c.req.header('user-agent'),
        timestamp: new Date().toISOString()
      }));
    }
    
    // Version extracted successfully
    
    await next();
  };
}

/**
 * Version enforcement middleware
 * Returns 410 Gone for sunset versions
 */
export function versionEnforcementMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const version = c.get('apiVersion') as ApiVersion | undefined;
    
    if (!version) {
      return next();
    }
    
    // Check if version is past sunset date
    const sunsetDate = DEPRECATED_VERSIONS[version];
    if (sunsetDate) {
      const sunset = new Date(sunsetDate);
      const now = new Date();
      
      if (now > sunset) {
        return c.json({
          error: 'Gone',
          message: `API ${version} has been sunset as of ${sunsetDate}.`,
          currentVersion: CURRENT_VERSION,
          migrationGuide: `/docs/migration/${version}-to-${CURRENT_VERSION}`
        }, 410);
      }
    }
    
    await next();
  };
}

/**
 * Helper to get current API version from context
 */
export function getApiVersion(c: Context<{ Bindings: Env }>): ApiVersion {
  return (c.get('apiVersion') as ApiVersion) || CURRENT_VERSION;
}

/**
 * Version-specific response transformer
 */
export function transformResponse(data: any, version: ApiVersion): any {
  // V1 format (legacy)
  if (version === API_VERSIONS.V1) {
    // V1 uses snake_case and different structure
    return transformToV1Format(data);
  }
  
  // V2 format (current) - return as-is
  return data;
}

/**
 * Transform data to V1 format for backward compatibility
 */
function transformToV1Format(data: any): any {
  if (Array.isArray(data)) {
    return data.map(transformToV1Format);
  }
  
  if (data && typeof data === 'object') {
    const transformed: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Convert camelCase to snake_case
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      transformed[snakeKey] = transformToV1Format(value);
    }
    
    return transformed;
  }
  
  return data;
}

/**
 * Version documentation generator
 */
export function generateVersionDocs(): string {
  const versions = Object.values(API_VERSIONS);
  
  let docs = '# API Versioning\n\n';
  docs += `Current Version: **${CURRENT_VERSION}**\n\n`;
  docs += '## Supported Versions\n\n';
  
  for (const version of versions) {
    const info = getVersionInfo(version);
    docs += `### ${version}\n`;
    docs += `- Status: ${info.isDeprecated ? '⚠️ Deprecated' : '✅ Active'}\n`;
    
    if (info.isDeprecated) {
      docs += `- Sunset Date: ${info.sunsetDate}\n`;
      docs += `- Message: ${info.message}\n`;
    }
    
    docs += `- Base URL: \`/api/${version}/\`\n\n`;
  }
  
  docs += '## Usage\n\n';
  docs += '```bash\n';
  docs += '# Use specific version\n';
  docs += `curl https://art-bank.pages.dev/api/${CURRENT_VERSION}/nodes\n\n`;
  docs += '# Use unversioned (defaults to current)\n';
  docs += 'curl https://art-bank.pages.dev/api/nodes\n';
  docs += '```\n\n';
  
  docs += '## Version Headers\n\n';
  docs += '- `X-API-Version` - Requested version\n';
  docs += '- `X-API-Current-Version` - Current/latest version\n';
  docs += '- `Deprecation` - "true" if version is deprecated\n';
  docs += '- `Sunset` - Date when version will be removed\n';
  docs += '- `Link` - Link to successor version\n\n';
  
  return docs;
}
