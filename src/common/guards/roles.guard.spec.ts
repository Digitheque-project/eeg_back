import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const contextAvec = (role?: string): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access when the route has no @Roles() restriction', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextAvec('TECHNICIEN'))).toBe(true);
  });

  it('should allow access when the user role is in the required list', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['CHEF_SERVICE']);
    expect(guard.canActivate(contextAvec('CHEF_SERVICE'))).toBe(true);
  });

  it('should reject when the user role is not in the required list', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['CHEF_SERVICE']);
    expect(() => guard.canActivate(contextAvec('TECHNICIEN'))).toThrow(
      ForbiddenException,
    );
  });

  it('should reject when there is no user/role at all on the request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['CHEF_SERVICE']);
    expect(() => guard.canActivate(contextAvec(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
