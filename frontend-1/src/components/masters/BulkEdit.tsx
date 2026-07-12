import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EditValueInput } from "@/components/filter/EditValueInput";
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
import type { FilterEnhancements } from "@/types/customRowRenderer";

interface BulkEditProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedData: any) => void;
  selectedRows: any[];
  metaData: Record<string, any>;
  type: string;
  view: string;
  filterEnhancements?: FilterEnhancements;
}

interface EditField {
  field: string;
  value: any;
  clearField?: boolean;
}

/**
 * For select columns, use filter recordPath (e.g. `account.name`) as search field
 * and label in Bulk Edit to match Filter modal behavior.
 */
const mergeSelectPropsForBulkEdit = (col: Record<string, any>) => {
  const selectProps = col?.tableProps?.selectProps;
  const recordPath: string | undefined = col?.filterProps?.recordPath;

  if (!selectProps || !recordPath) return selectProps;

  const field = recordPath.split(".").pop();
  if (!field) return selectProps;

  return { ...selectProps, searchParams: field, instanceLabel: field };
};

export const BulkEdit: React.FC<BulkEditProps> = ({
  isOpen,
  onClose,
  onSave,
  selectedRows,
  metaData,
  type,
  view,
  filterEnhancements,
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

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-[700px] rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#403E43]">
            Bulk Edit ({selectedRows.length} items)
          </DialogTitle>
          <p className="text-xs text-[#6b7280] mt-1">
            Update multiple fields at once. Use "Clear" to set fields to empty values.
          </p>
        </DialogHeader>

        {metaData && (
          <div className="space-y-4 py-4">
            {editFields.map((field, index) => (
              <div
                key={index}
                className="grid grid-cols-[48px_170px_minmax(0,1fr)_90px_36px] gap-2 items-start"
              >
                <div className="w-12 flex justify-center pt-2">
                  {index === 0 ? (
                    <span className="text-[11px] text-[#9ca3af] font-semibold select-none">
                      WHERE
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold tracking-[.06em] text-[#64748b] bg-[#f1f5f9] rounded-[3px] px-[5px] py-px select-none">
                      AND
                    </span>
                  )}
                </div>
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
                        .filter(([key, value]) =>
                          value?.permission === "update" &&
                          value?.datatype !== "date" &&
                          value?.dataType !== "date" &&
                          !editFields.some((f, i) => i !== index && f.field === key)
                        )
                        .map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            {value.displayName}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>

                {field.field && metaData[field.field] && (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="flex-1 relative min-w-0">
                      {(() => {
                        const columnMeta = metaData[field.field];
                        const mergedSelectProps = mergeSelectPropsForBulkEdit(columnMeta);
                        const bulkEditCol =
                          columnMeta?.tableProps?.columnType === "select" && mergedSelectProps
                            ? {
                              ...columnMeta,
                              tableProps: {
                                ...columnMeta.tableProps,
                                selectProps: mergedSelectProps,
                              },
                            }
                            : columnMeta;

                        return (
                          <EditValueInput
                            className={field.clearField ? 'opacity-50 pointer-events-none' : ''}
                            value={field.value ? String(field.value) : ''}
                            onChange={(val) => updateField(index, "value", val)}
                            col={bulkEditCol}
                            additionalFilters={filterEnhancements?.[field.field]?.additionalFilters}
                          />
                        );
                      })()}
                      {field.clearField && (
                        <div className="absolute inset-0 flex items-center justify-center bg-red-50 border border-red-200 rounded-md">
                          <span className="text-red-600 text-sm font-medium">Will be cleared</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {!field.field && <div />}
                <Button
                  type="button"
                  variant={field.clearField ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => updateField(index, "clearField", !field.clearField)}
                  disabled={!field.field}
                  className="flex items-center gap-1 min-w-[80px] mt-px"
                >
                  <Trash2 className="h-3 w-3" />
                  {field.clearField ? "Undo" : "Clear"}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeField(index)}
                  disabled={editFields.length === 1}
                  className="hover:bg-[#FDE1D3] mt-1"
                >
                  <X className="h-4 w-4 text-[#d946ef]" />
                </Button>
              </div>
            ))}

            <button
              type="button"
              className="ml-12 inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold text-[#7028a0] bg-white border border-[#d1a9e4] rounded-md hover:bg-[#f5ebf9] transition-colors"
              onClick={addField}
            >
              <Plus className="h-3.5 w-3.5" /> Add edit row
            </button>
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
