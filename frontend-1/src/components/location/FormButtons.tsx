
import React from 'react';
import { Button } from '@/components/ui/button';

interface FormButtonsProps {
  isSubmitting: boolean;
  onCancel: () => void;
}

const FormButtons: React.FC<FormButtonsProps> = ({ isSubmitting, onCancel }) => {
  return (
    <div className="flex justify-end space-x-2">
      <Button 
        type="button" 
        variant="outline" 
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button 
        type="submit" 
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
};

export default FormButtons;
