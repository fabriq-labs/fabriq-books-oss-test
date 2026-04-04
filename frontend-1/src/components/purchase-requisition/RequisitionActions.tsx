
import React from 'react';
import { Button, Space, Tooltip } from 'antd';
import { EyeOutlined } from '@ant-design/icons';

interface RequisitionActionsProps {
  record: {
    id: string;
    status: string;
  };
  onView: (id: string) => void;
}

export const RequisitionActions: React.FC<RequisitionActionsProps> = ({ record, onView }) => {
  return (
    <Space size="middle">
      <Tooltip title="View Requisition">
        <Button 
          type="text" 
          icon={<EyeOutlined style={{ color: '#3b82f6' }} />} 
          size="small"
          onClick={() => onView(record.id)}
          className="hover:bg-blue-50"
        />
      </Tooltip>
    </Space>
  );
};
