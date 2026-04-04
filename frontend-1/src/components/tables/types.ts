
export interface DataItem {
  id: string;
  number: string;
  date: string;
  reason: string;
  total: number;
  status: string;
}

export interface DataTableProps {
  title: string;
  data: {
    todos: DataItem[];
    raisedByMe: DataItem[];
  };
  onView?: (id: string) => void;
  onDelete?: (id: string) => void;
}
