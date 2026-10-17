import { createAuthClient } from 'better-auth/react';

// No baseURL: the client calls /api/auth on the same origin (spec §2.2, §7.2).
export const authClient = createAuthClient();
