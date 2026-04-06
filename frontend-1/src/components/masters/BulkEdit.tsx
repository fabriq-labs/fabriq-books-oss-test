import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterInputs } from "@/components/filter/FilterInputs";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus, Trash2 } from "lucide-react";
import { bulkEditAPI } from "@/api/api";

interface BulkEditProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedData: any) => void;
  selectedRows: any[];
  metaData: Record<string, any>;
  type: string;
  view: string;
}

interface EditField {
  field: string;
  value: any;
  clearField?: boolean;
}

export const BulkEdit: React.FC<BulkEditProps> = ({
  isOpen,
  onClose,
  onSave,
  selectedRows,
  metaData,
  type,
  view,
}) => {
  const [editFields, setEditFields] = React.useState<EditField[]>([
    { field: "", value: "", clearField: false },
  ]);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  // Reset form data when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setEditFields([{ field: "", value: "", clearField: false }]);
    }
  }, [isOpen]);

  const addField = () => {
    setEditFields([...editFields, { field: "", value: "", clearField: false }]);
  };

  const removeField = (index: number) => {
    setEditFields(editFields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: string, value: any) => {
    const newFields = [...editFields];
    newFields[index] = { ...newFields[index], [field]: value };
    setEditFields(newFields);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Convert editFields to a format suitable for saving
    const editData: Record<string, any> = {};
    editFields.forEach((field) => {
      if (field.field) {
        // If clearField is checked, set to null
        if (field.clearField) {
          editData[field.field] = null;
        } else if (field.value !== undefined && field.value !== "") {
          editData[field.field] = field.value;
        }
      }
    });

    if (Object.keys(editData).length === 0) {
      toast({
        title: "No changes",
        description: "Please make at least one change before saving",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const bulkData = {
        ids: selectedRows.map((row) => row.id),
        data: editData,
      };

      await bulkEditAPI.updateBulkData(type, view, bulkData);

      toast({
        title: "Success",
        description: `${selectedRows.length} items updated successfully`,
      });

      onSave(editData);
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update items",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#403E43]">
            Bulk Edit ({selectedRows.length} items)
          </DialogTitle>
          <p className="text-sm text-gray-600 mt-1">
            Update multiple fields at once. Use "Clear" to set fields to empty values.
          </p>
        </DialogHeader>

        {metaData && (
          <div className="space-y-4 py-4">
            {editFields.map((field, index) => (
              <div key={index} className="flex gap-3 items-center p-3 bg-gray-50 rounded-lg border">
                <Select
                  value={field.field}
                  onValueChange={(value) => updateField(index, "field", value)}
                >
                  <SelectTrigger className="w-[170px] bg-[#F1F0FB] border-[#E5DEFF]">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {metaData &&
                      Object.entries(metaData)
                        .filter(
                          ([_, value]) =>
                            value?.permission === "update" && value?.datatype !== "date"
                        )
                        .map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            {value.displayName}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>

                {field.field && metaData[field.field] && (
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 relative">
                      <FilterInputs
                        className={`flex-1 bg-[#F1F0FB] border-[#E5DEFF] ${field.clearField ? 'opacity-50 pointer-events-none' : ''
                          }`}
                        value={String(field.value)}
                        onChange={(val) => updateField(index, "value", val)}
                        col={metaData[field.field]}
                      />
                      {field.clearField && (
                        <div className="absolute inset-0 flex items-center justify-center bg-red-50 border border-red-200 rounded-md">
                          <span className="text-red-600 text-sm font-medium">Will be cleared</span>
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant={field.clearField ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => updateField(index, "clearField", !field.clearField)}
                      className="flex items-center gap-1 min-w-[80px]"
                    >
                      <Trash2 className="h-3 w-3" />
                      {field.clearField ? "Undo" : "Clear"}
                    </Button>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeField(index)}
                  disabled={editFields.length === 1}
                  className="hover:bg-[#FDE1D3]"
                >
                  <X className="h-4 w-4 text-[#d946ef]" />
                </Button>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-[#9b87f5] border-[#9b87f5] hover:bg-[#E5DEFF] font-semibold px-4 py-2"
              onClick={addField}
            >
              <Plus className="h-4 w-4" /> Add Another Field
            </Button>
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-gray-500">
            {editFields.filter(f => f.field).length} field{editFields.filter(f => f.field).length !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="px-6 text-[#403E43] border-[#E5DEFF] bg-[#f3f3f3] hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="px-6 bg-primary hover:bg-primary text-white font-semibold shadow-sm"
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? "Updating..." : `Update ${selectedRows.length} Items`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
