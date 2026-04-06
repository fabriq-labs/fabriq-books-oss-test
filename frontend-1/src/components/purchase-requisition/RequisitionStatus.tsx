import { Tag } from 'antd';

export type RequisitionStatus =
  | 'Draft'
  | 'Department Approval'
  | 'Finance Approval'
  | 'Procurement Approval'
  | 'Approved'
  | 'Pending Completion'
  | 'Completed'
  | 'Rejected';


export const getStatusText = (statusCode: string | number): string => {
  const statusMap = {
    '2': 'Draft',
    '3': 'Submitted',
    '4': 'Manager Approved',
    '5': 'Manager Rejected',
    '6': 'PD Approved',
    '7': 'PD Rejected',
    '8': 'Delivered',
    '13': 'Draft',
    '14': 'Submitted',
    '15': 'Approved',
    '9': 'Draft',
    '10': 'Submitted',
    '12': 'Approved',
  };
  const code = String(statusCode);
  return statusMap[code] || code;
};
export const getStatusColor = (status: string | number) => {
  const statusText = typeof status === 'number' || !isNaN(Number(status))
    ? getStatusText(status)
    : status;

  switch (statusText) {
    case 'Approved':
    case 'PD Approved':
    case 'Manager Approved':
      return 'green';
    case 'Completed':
      return 'blue';
    case 'Rejected':
    case 'Manager Rejected':
    case 'PD Rejected':
      return '#D6BCFA';
    case 'Draft':
      return 'default';
    case 'Submitted':
    case 'Department Approval':
      return 'processing';
    case 'Finance Approval':
      return 'cyan';
    case 'Procurement Approval':
      return 'geekblue';
    case 'Pending Completion':
      return 'orange';
    default:
      return 'default';
  }
};


export const getListStatusColor = (status: string | number) => {
  const statusText = typeof status === 'number' || !isNaN(Number(status))
    ? getStatusText(status)
    : status;

  switch (statusText) {
    case 'Approved':
    case 'PD Approved':
    case 'Manager Approved':
      return 'bg-green-100 text-green-800';
    case 'Rejected':
    case 'Manager Rejected':
    case 'PD Rejected':
      return 'bg-red-100 text-red-800';
    case 'Draft':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
};

interface StatusTagProps {
  status: string | number;
}

export const StatusTag: React.FC<StatusTagProps> = ({ status }) => {
  if (status === undefined || status === null) {
    return <Tag color="default">UNKNOWN</Tag>;
  }

  const statusText = typeof status === 'number' || !isNaN(Number(status))
    ? getStatusText(status)
    : status;
  const color = getStatusColor(status);

  return (
    <Tag color={color}>
      {statusText ? statusText.toUpperCase() : ''}
    </Tag>
  );
};

export default StatusTag;
