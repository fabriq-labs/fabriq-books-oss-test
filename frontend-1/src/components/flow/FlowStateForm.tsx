
import React from 'react';
import { Save, X } from 'lucide-react';
import { FlowState, FlowStateFormData } from '@/models/FlowState';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useFlowStateForm } from './form/useFlowStateForm';
import FormFields from './form/FormFields';
import RoleSelector from './form/RoleSelector';
import UserSelector from './form/UserSelector';

interface FlowStateFormProps {
  initialValues: FlowState | null;
  onSubmit: (data: FlowStateFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

const FlowStateForm: React.FC<FlowStateFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting,
}) => {
  const {
    form,
    roles,
    users,
    selectedUsers,
    handleSubmit,
    toggleUser
  } = useFlowStateForm(initialValues, onSubmit);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>{initialValues ? 'Edit Flow State' : 'Add Flow State'}</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-4">
            <FormFields form={form} />
            <RoleSelector form={form} roles={roles} />
            <UserSelector 
              form={form} 
              users={users} 
              selectedUsers={selectedUsers} 
              toggleUser={toggleUser} 
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-2" />
              {initialValues ? 'Update' : 'Save'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};

export default FlowStateForm;
