import { unknownWriteFields, unknownWriteFieldsMessage } from '../unknownWriteFields';

describe('unknownWriteFields', () => {
  it('names keys that are not on the model and leaves the payload in place', () => {
    const data: Record<string, unknown> = {
      name: 'Kernel Admin',
      email: 'admin@example.com',
      manager_id: 'user_kernel_admin',
      not_a_column: null,
      modified_by: 'user_kernel_admin',
    };
    expect(unknownWriteFields('user', data)).toEqual(['not_a_column']);
    expect(data.not_a_column).toBeNull();
    expect(data.manager_id).toBe('user_kernel_admin');
  });

  it('accepts scalar foreign keys and relation names', () => {
    const data: Record<string, unknown> = {
      role_id: 'role_1',
      org_id: 'org_kernel',
      user: { connect: { id: 'user_kernel_admin' } },
    };
    expect(unknownWriteFields('role_user', data)).toEqual([]);
  });

  it('does not treat every key as unknown when the model is missing from the client', () => {
    expect(unknownWriteFields('not_a_model', { anything: 1 })).toEqual([]);
  });

  it('builds a message that names the model and the fields', () => {
    expect(unknownWriteFieldsMessage('user', ['not_a_column'])).toBe(
      'Unknown field on user: not_a_column'
    );
    expect(unknownWriteFieldsMessage('user', ['a', 'b'])).toBe('Unknown fields on user: a, b');
  });
});
