import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  computeColumnFingerprint,
  countVisibleColumns,
  resolveColumnOrder,
  resolveVisibility,
} from "@/utils/columnPreferences";
import { formatColumnPreviewValue } from "@/utils/formatColumnPreviewValue";

export interface ColumnSelectorItem {
  key: string;
  label: string;
  preview: string | null;
  visible: boolean;
}

interface ColumnSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  metaData: Record<string, any>;
  /** First list row used to preview sample values per column. */
  sampleRow?: Record<string, any> | null;
  /** Currently applied visibility (may include saved user overrides). */
  appliedVisibility: Record<string, boolean>;
  /** Currently applied column order. */
  appliedColumnOrder: string[];
  onSave: (
    visibility: Record<string, boolean>,
    columnOrder: string[],
  ) => void;
  onRestoreDefaults: () => void;
}

function buildItems(
  metaData: Record<string, any>,
  visibility: Record<string, boolean>,
  columnOrder: string[],
  sampleRow?: Record<string, any> | null,
): ColumnSelectorItem[] {
  const resolvedVisibility = resolveVisibility(metaData, visibility);
  const orderedKeys = resolveColumnOrder(metaData, columnOrder);

  return orderedKeys.map((key) => ({
    key,
    label: metaData[key].displayName as string,
    preview: formatColumnPreviewValue(sampleRow, key, metaData[key]),
    visible: resolvedVisibility[key],
  }));
}

interface SortableColumnRowProps {
  item: ColumnSelectorItem;
  onToggle: (key: string) => void;
}

function SortableColumnRow({ item, onToggle }: SortableColumnRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 ${
        isDragging ? "z-10 bg-muted shadow-sm" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Reorder ${item.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <Checkbox
        id={`col-${item.key}`}
        checked={item.visible}
        onCheckedChange={() => onToggle(item.key)}
      />
      <Label
        htmlFor={`col-${item.key}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 font-normal"
      >
        <span className="w-[38%] shrink-0 text-sm leading-snug sm:w-[34%]">
          {item.label}
        </span>
        {item.preview != null && (
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground/80 leading-snug">
            {item.preview}
          </span>
        )}
      </Label>
    </div>
  );
}

export default function ColumnSelectorModal({
  isOpen,
  onClose,
  metaData,
  sampleRow,
  appliedVisibility,
  appliedColumnOrder,
  onSave,
  onRestoreDefaults,
}: ColumnSelectorModalProps) {
  const [draft, setDraft] = useState<ColumnSelectorItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const fingerprint = useMemo(
    () => computeColumnFingerprint(metaData),
    [metaData],
  );

  useEffect(() => {
    if (!isOpen) return;
    setDraft(
      buildItems(metaData, appliedVisibility, appliedColumnOrder, sampleRow),
    );
    setError(null);
  }, [
    isOpen,
    metaData,
    appliedVisibility,
    appliedColumnOrder,
    fingerprint,
    sampleRow,
  ]);

  const visibleCount = countVisibleColumns(
    Object.fromEntries(draft.map((item) => [item.key, item.visible])),
  );

  const toggleColumn = (key: string) => {
    setDraft((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, visible: !item.visible } : item,
      ),
    );
    setError(null);
  };

  const selectAll = () => {
    setDraft((prev) => prev.map((item) => ({ ...item, visible: true })));
    setError(null);
  };

  const clearAll = () => {
    setDraft((prev) => prev.map((item) => ({ ...item, visible: false })));
    setError(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDraft((prev) => {
      const oldIndex = prev.findIndex((item) => item.key === active.id);
      const newIndex = prev.findIndex((item) => item.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleSave = () => {
    const visibility = Object.fromEntries(
      draft.map((item) => [item.key, item.visible]),
    );
    if (countVisibleColumns(visibility) === 0) {
      setError("At least one column must remain visible.");
      return;
    }
    onSave(
      visibility,
      draft.map((item) => item.key),
    );
  };

  const handleCancel = () => {
    setError(null);
    onClose();
  };

  const handleRestore = () => {
    setError(null);
    onRestoreDefaults();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Columns</DialogTitle>
          <DialogDescription>
            Choose which columns appear in this list and drag to reorder. Changes
            apply only to your account on this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            {visibleCount} of {draft.length} columns visible
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={selectAll}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={draft.map((item) => item.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="max-h-72 overflow-y-auto rounded-md border p-2 space-y-1">
              {draft.map((item) => (
                <SortableColumnRow
                  key={item.key}
                  item={item}
                  onToggle={toggleColumn}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="sm:mr-auto"
            onClick={handleRestore}
          >
            Restore defaults
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
