import { FastifyRequest } from 'fastify';

/**
 * Rate limit configuration for different user types
 */
export interface RateLimitConfig {
  // Anonymous users (by IP)
  anonymous: {
    max: number;
    window: string;
    maxFileSize: number;
  };
  // Authenticated users
  authenticated: {
    max: number;
    window: string;
    maxFileSize: number;
  };
}

export const defaultRateLimitConfig: RateLimitConfig = {
  anonymous: {
    max: 5,
    window: '1 hour',
    maxFileSize: 50 * 1024 * 1024, // 50MB
  },
  authenticated: {
    max: 20,
    window: '1 hour',
    maxFileSize: 100 * 1024 * 1024, // 100MB
  },
};

/**
 * Extract client IP from request
 * Handles X-Forwarded-For header for proxied requests
 */
export function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  
  if (forwarded) {
    const ips = typeof forwarded === 'string' 
      ? forwarded.split(',') 
      : forwarded;
    return ips[0].trim();
  }
  
  return request.ip;
}

/**
 * Check if a user is authenticated
 * This is a placeholder - implement your own authentication logic
 */
export function isAuthenticated(request: FastifyRequest): boolean {
  // Check for auth header or token
  const authHeader = request.headers.authorization;
  
  if (authHeader?.startsWith('Bearer ')) {
    // Validate token here
    // For now, just check if it exists
    return authHeader.length > 7;
  }
  
  return false;
}

/**
 * Get rate limit config for a request
 */
export function getRateLimitForRequest(
  request: FastifyRequest,
  config: RateLimitConfig = defaultRateLimitConfig
): { max: number; window: string; maxFileSize: number } {
  if (isAuthenticated(request)) {
    return config.authenticated;
  }
  
  return config.anonymous;
}

