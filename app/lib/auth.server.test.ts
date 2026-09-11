import {describe, expect, it} from 'vitest';
import {
  authenticateAdmin,
  createSessionCookie,
  getAuthenticatedUser,
  logoutResponse,
  requireAdmin,
} from './auth.server';

const context = {
  env: {
    AUTH_ADMIN_CREDENTIALS: 'noah:correct-horse-battery-staple',
    AUTH_SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  },
};

describe('shared auth', () => {
  it('accepts the configured administrator credentials', async () => {
    await expect(
      authenticateAdmin(context, 'noah', 'correct-horse-battery-staple'),
    ).resolves.toEqual({id: 'noah', role: 'admin'});
    await expect(authenticateAdmin(context, 'noah', 'wrong')).resolves.toBeNull();
  });

  it('supports the legacy cabinet admin credential during migration', async () => {
    const legacy = {env: {CABINET_ADMIN_CREDENTIALS: 'admin:secret'}};
    await expect(authenticateAdmin(legacy, 'admin', 'secret')).resolves.toEqual({
      id: 'admin',
      role: 'admin',
    });
  });

  it('creates and verifies a secure signed session cookie', async () => {
    const cookie = await createSessionCookie(context, {id: 'noah', role: 'admin'});
    expect(cookie).toContain('__Host-ft_auth=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');

    const request = new Request('https://from-trees.com/admin/example', {
      headers: {Cookie: cookie.split(';')[0]},
    });
    await expect(getAuthenticatedUser(request, context)).resolves.toEqual({
      id: 'noah',
      role: 'admin',
    });
  });

  it('rejects tampered session cookies', async () => {
    const cookie = await createSessionCookie(context, {id: 'noah', role: 'admin'});
    const pair = cookie.split(';')[0];
    const request = new Request('https://from-trees.com/admin/example', {
      headers: {Cookie: `${pair}x`},
    });
    await expect(getAuthenticatedUser(request, context)).resolves.toBeNull();
  });

  it('redirects unauthenticated protected requests to the generic login route', async () => {
    const request = new Request(
      'https://from-trees.com/admin/custom-cabinets?mode=edit',
    );
    try {
      await requireAdmin(request, context);
      throw new Error('expected requireAdmin to redirect');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe(
        '/login?returnTo=%2Fadmin%2Fcustom-cabinets%3Fmode%3Dedit',
      );
    }
  });

  it('clears the shared auth cookie on logout', () => {
    const response = logoutResponse('/login');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
