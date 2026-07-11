import { RequestUser } from '@/common/types/auth-user.types';

// Augments Express' Request with the authenticated user attached by AuthGuard.
declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export {};
