
// Fix the type error related to User status property
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/models/User";

export async function createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>) {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .insert([user])
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
}

export async function updateUser(id: string, user: Omit<User, 'id' | 'created_at' | 'updated_at'>) {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .update(user)
      .eq('id', id)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating user:', error);
    return null;
  }
}

export async function deleteUser(id: string) {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error deleting user:', error);
    return null;
  }
}

export async function getUsers() {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*');

    if (error) throw error;
    return data as User[];
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

export async function getUsersWithDepartments(): Promise<(User & { department: { dept_name: string } })[]> {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select(`
        id,
        username,
        email,
        status,
        dept_id,
        password,
        created_at,
        updated_at,
        departments!inner(dept_name)
      `);

    if (error) throw error;

    // Transform the data to match the expected type
    const usersWithDepartments = data.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      status: user.status as "Active" | "Inactive", // Explicitly cast to the expected union type
      dept_id: user.dept_id,
      password: user.password,
      created_at: user.created_at,
      updated_at: user.updated_at,
      department: {
        dept_name: user.departments.dept_name
      }
    })) as (User & { department: { dept_name: string } })[];

    return usersWithDepartments;
  } catch (error) {
    console.error('Error fetching users with departments:', error);
    return [];
  }
}

// Add the missing authenticateUser function
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error) throw new Error('Invalid email or password');
    
    if (!data) throw new Error('User not found');
    
    return data as User;
  } catch (error) {
    console.error('Error authenticating user:', error);
    throw new Error('Invalid email or password');
  }
}
