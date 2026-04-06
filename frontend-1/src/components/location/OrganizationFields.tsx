
import React, { useEffect, useState } from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { UseFormReturn } from 'react-hook-form';
import { LocationFormValues } from './LocationFormTypes';
import { Organization } from '@/models/Organization';
import { getOrganizations } from '@/services/organizationService';
import { getDepartments } from '@/services/departmentService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface OrganizationFieldsProps {
  form: UseFormReturn<LocationFormValues>;
}

const OrganizationFields: React.FC<OrganizationFieldsProps> = ({ form }) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedOrgId = form.watch('org_id');

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const orgData = await getOrganizations();
        setOrganizations(orgData);
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrganizations();
  }, []);

  useEffect(() => {
    const fetchDepartments = async () => {
      if (selectedOrgId) {
        try {
          const deptData = await getDepartments();
          const filteredDepts = deptData.filter(dept => dept.org_id === selectedOrgId);
          setDepartments(filteredDepts);
        } catch (error) {
          console.error('Failed to fetch departments:', error);
        }
      } else {
        setDepartments([]);
      }
    };

    fetchDepartments();
  }, [selectedOrgId]);

  if (loading) {
    return <div>Loading organization data...</div>;
  }

  return (
    <>
      <FormField
        control={form.control}
        name="org_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Organization</FormLabel>
            <Select 
              onValueChange={field.onChange} 
              defaultValue={field.value || undefined}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select an organization" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.org_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="department_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Department</FormLabel>
            <Select 
              onValueChange={field.onChange} 
              defaultValue={field.value || undefined}
              disabled={!selectedOrgId || departments.length === 0}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={!selectedOrgId ? "Select organization first" : "Select a department"} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {departments.length > 0 ? (
                  departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.dept_name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-departments-available">No departments available</SelectItem>
                )}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};

export default OrganizationFields;
