import React from 'react';
import {
  FilePlus,
  FileText,
  ShoppingCart,
  UserPlus
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { workflowAPI } from '@/api/api';
import { useEffect, useState } from "react";
import { useNavigate } from 'react-router-dom';
const ActionCard = ({
  icon: Icon,
  title,
  path
}: {
  icon: React.ElementType;
  title: string;
  path: string;
}) => (
  <Link to={path}>
    <Card className="p-4 flex flex-col items-center justify-center h-36 hover:bg-primary-50 hover:border-primary-200 transition-colors cursor-pointer">
      <Icon className="h-10 w-10 text-primary-600 mb-3" />
      <span className="text-sm font-medium text-center">{title}</span>
    </Card>
  </Link>
);

export const ActionCards = () => {
  const [isError, setError] = useState<any>({});
  const navigate = useNavigate();
  const handleCreate = () => {
    workflowAPI.create("purchase_requisition", "2", {
      status: "2",
    })
      .then((res: any) => {
        handleDetails(res.data.id);
      })
      .catch((err) => {
        const { response } = err;
        setError({ error: true });
        if (response?.status != 400) {
          setError({
            status: response?.status,
            title: response?.statusText,
            subTitle: response?.data?.error,
          });
        }
        console.log("Error :", err.message);
      });
  };
  const handleDetails = (id: any) => {
    navigate(`/purchases/requisitions`);
  };

  const handleCreateInvoice = () => {
    workflowAPI.create("invoice", "9", {
      status: "9",
    })
      .then((res: any) => {
        handleInvoiceDetails(res?.data?.id);
      })
      .catch((err) => {
        const { response } = err;
        setError({ error: true });
        if (response?.status != 400) {
          setError({
            status: response?.status,
            title: response?.statusText,
            subTitle: response?.data?.error,
          });
        }
        console.log("Error :", err.message);
      });
  };
  const handleInvoiceDetails = (id: any) => {
    navigate(`/purchases/bills`);
  };
  const handleCreatePurchaseOrder = () => {
    workflowAPI.create("purchase_order", "13", {
      status: "13",
    })
      .then((res: any) => {
        handleOrderDetails(res.data.id);
      })
      .catch((err) => {
        const { response } = err;
        setError({ error: true });
        if (response?.status != 400) {
          setError({
            status: response?.status,
            title: response?.statusText,
            subTitle: response?.data?.error,
          });
        }
        console.log("Error :", err.message);
      });
  };
  const handleOrderDetails = (id: any) => {
    navigate(`/purchases/orders`);
  };
  const handleCreateSupplier = () => {
    navigate(`/supplier/create`);
  };


  const actions = [
    { icon: FilePlus, title: 'New Purchase', onClick: handleCreate },
    { icon: FileText, title: 'New Invoice', onClick: handleCreateInvoice },
    { icon: ShoppingCart, title: 'New Order', onClick: handleCreatePurchaseOrder },
    { icon: UserPlus, title: 'New Supplier', onClick: handleCreateSupplier },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {actions.map((action, i) => (
        <Card key={i} className="p-4 flex flex-col items-center justify-center h-36 hover:bg-primary-50 hover:border-primary-200 transition-colors cursor-pointer" onClick={action.onClick}>
          <action.icon className="h-10 w-10 text-primary-600 mb-3" />
          <span className="text-sm font-medium text-center">{action.title}</span>
        </Card>
      ))}    </div>);
};
