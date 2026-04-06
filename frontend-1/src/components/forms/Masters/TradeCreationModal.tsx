import React, { useState } from 'react';
import { Modal } from 'antd';
import { TradeForm } from './TradeForm';
import { viewAPI } from '@/api/api';
import { useToast } from '@/components/ui/use-toast';

interface TradeCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  postingData: any;
  existingTrade?: any;
  onTradeCreated: (tradeId: string) => void;
}

export const TradeCreationModal: React.FC<TradeCreationModalProps> = ({
  isOpen,
  onClose,
  postingData,
  existingTrade,
  onTradeCreated
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleTradeCreated = async (tradeData: any) => {
    try {
      setIsSubmitting(true);
      // Link the trade to the posting
      await viewAPI.update("posting", postingData.id, "default", {
        trade_id: tradeData.id
      });
      toast({
        title: "Success",
        description: "Trade created and linked to posting successfully",
      });
      // Pass the full trade data back to update posting form state
      onTradeCreated(tradeData.id);
      onClose();
    } catch (error: any) {
      console.error("Failed to link trade to posting:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to link trade to posting",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <Modal
      title="Create Trade Entry"
      open={isOpen}
      onCancel={handleCancel}
      footer={null}
      width={900}
      centered
      destroyOnClose
      maskClosable={!isSubmitting}
      closable={!isSubmitting}
      styles={{
        body: {
          padding: '0px',
          maxHeight: '80vh',
          overflowY: 'auto',
        }
      }}
    >
      <TradeForm
        postingData={postingData}
        existingTrade={existingTrade}
        onTradeCreated={handleTradeCreated}
        isModal={true}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
        viewId="trade_view"
      />
    </Modal>
  );
};

