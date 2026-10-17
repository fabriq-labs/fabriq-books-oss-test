import { omitUnknownWriteFields } from '../omitUnknownWriteFields';

describe('omitUnknownWriteFields', () => {
  it('keeps user scalars and the manager foreign key', () => {
    const data: Record<string, unknown> = {
      name: 'Kernel Admin',
      email: 'admin@example.com',
      manager_id: 'user_kernel_admin',
      department_id: null,
      modified_by: 'user_kernel_admin',
    };
    const dropped = omitUnknownWriteFields('user', data);
    expect(dropped).toEqual(['department_id']);
    expect(data).toEqual({
      name: 'Kernel Admin',
      email: 'admin@example.com',
      manager_id: 'user_kernel_admin',
      modified_by: 'user_kernel_admin',
    });
  });

  it('keeps relation names used for nested writes', () => {
    const data: Record<string, unknown> = {
      role_id: 'role_1',
      org_id: 'org_kernel',
      not_a_column: 'x',
    };
    expect(omitUnknownWriteFields('role_user', data)).toEqual(['not_a_column']);
    expect(data.role_id).toBe('role_1');
    expect(data.org_id).toBe('org_kernel');
  });

  it('leaves the payload unchanged when the model is unknown', () => {
    const data = { anything: 1 };
    expect(omitUnknownWriteFields('not_a_model', data)).toEqual([]);
    expect(data).toEqual({ anything: 1 });
  });
});
