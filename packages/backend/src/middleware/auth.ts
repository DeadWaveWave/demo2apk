import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';

export interface User {
  id: string;
  email?: string;
  name?: string;
  tier: 'free' | 'pro';
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

/**
 * Optional authentication middleware
 * Sets request.user if valid auth token is provided
 * Does not block unauthenticated requests
 */
export const optionalAuth: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return; // No auth, continue as anonymous
    }

    const token = authHeader.slice(7);

    try {
      // Validate token and get user
      // This is a placeholder - implement your own token validation
      const user = await validateToken(token);
      
      if (user) {
        request.user = user;
      }
    } catch (error) {
      // Invalid token, continue as anonymous
      request.log.debug({ error }, 'Invalid auth token');
    }
  });
};

/**
 * Required authentication middleware
 * Returns 401 if not authenticated
 */
export const requireAuth: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required. Please provide a valid Bearer token.',
      });
    }

    const token = authHeader.slice(7);

    try {
      const user = await validateToken(token);
      
      if (!user) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired token.',
        });
      }
      
      request.user = user;
    } catch (error) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication failed.',
      });
    }
  });
};

/**
 * Validate authentication token
 * Placeholder implementation - replace with your own auth logic
 */
async function validateToken(token: string): Promise<User | null> {
  // TODO: Implement actual token validation
  // Options:
  // 1. JWT validation
  // 2. Database lookup
  // 3. OAuth provider validation
  
  // For now, accept any non-empty token for development
  if (token && token.length > 10) {
    return {
      id: 'dev-user',
      email: 'dev@example.com',
      name: 'Developer',
      tier: 'pro',
    };
  }
  
  return null;
}

/**
 * Get user's tier limits
 */
export function getUserLimits(user?: User): {
  maxBuildsPerHour: number;
  maxFileSize: number;
  historyRetention: number;
} {
  if (user?.tier === 'pro') {
    return {
      maxBuildsPerHour: 10,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      historyRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }
  
  // Free/anonymous limits
  return {
    maxBuildsPerHour: 3,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    historyRetention: 24 * 60 * 60 * 1000, // 24 hours
  };
}

