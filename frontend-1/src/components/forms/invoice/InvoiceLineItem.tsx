/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState, memo } from 'react';
import { Card, Button, Table, InputNumber, Space, Spin } from 'antd';
import { DeleteOutlined, LoadingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { viewAPI } from '@/api/api';
import { useToast } from "@/components/ui/use-toast";



interface LineItem {
    id: string;
    itemCode: string;
    itemImage: string;
    itemDescription: string;
    quantity: number;
    rate: number;
    itemTotal: number;
    costCenter: string;
    requisitionId: any
}

interface LineItemsTableProps {
    lineItems: LineItem[];
    setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
    editingRowId: string | null;
    setEditingRowId: React.Dispatch<React.SetStateAction<string | null>>;
    currentLineItem: LineItem;
    setCurrentLineItem: React.Dispatch<React.SetStateAction<LineItem>>;
    updateTotalAmount: (items: LineItem[]) => void;
    budgetLevel?: any;
    details: any;
    setDetails: any;
    readOnly: boolean;
    requisitionId: any;
    total: any;
}

const EditableCell = memo(({ isEditing, value, onEdit, readOnly, children }: any) => {
    if (isEditing) {
        return children;
    }
    return (
        <div
            onClick={() => !readOnly && onEdit()}
            style={{ cursor: readOnly ? 'default' : 'pointer' }}
        >
            <a
                href="#"
                className="w-full hover:bg-gray-100 focus:bg-blue-100 focus:outline-2 focus:outline-blue-500 p-2 rounded"
                style={{
                    display: 'block',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background-color 0.2s ease'
                }}
            >
                {children}
            </a>
        </div>
    );
});

const InvoiceLineItemsTable: React.FC<LineItemsTableProps> = ({
    lineItems,
    setLineItems,
    editingRowId,
    setEditingRowId,
    currentLineItem,
    setCurrentLineItem,
    updateTotalAmount,
    budgetLevel,
    details,
    setDetails,
    readOnly,
    requisitionId,
    total
}) => {
    const [itemDetails, setItemDetails] = useState<any[]>([]);
    const [editableField, setEditableField] = useState<{ id: string | null, field: string | null }>({ id: null, field: null });
    const [tempQuantity, setTempQuantity] = useState<number | null>(null);
    const [isRowLoading, setRowLoading] = useState<string | null>(null);
    const { toast } = useToast();
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // Function to clear editing state
    const clearEditingState = () => {
        if (tempQuantity !== null && editableField.id) {
            handleFieldUpdate(editableField.id, 'invoice_qty', tempQuantity);
            setTempQuantity(null);
        }
        setEditableField({ id: null, field: null });
    };

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && editableField.id !== null) {
                clearEditingState();
            }
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [editableField, tempQuantity]);

    useEffect(() => {
        if (details?.invoice_line_item && Array.isArray(details.invoice_line_item)) {
            const mappedItems = details.invoice_line_item
                .map((item: any) => ({
                    id: item?.id,
                    product_id: item?.item_master?.id,
                    item_name: item?.item_master?.item_name,
                    item_type: item?.item_master?.item_type,
                    item_description: item?.item_master?.item_description,
                    rate: item?.item_master?.unit_price,
                    invoice_qty: item?.invoice_qty,
                    line_total: item?.line_total,
                    tax_rate: item?.tax_rate,
                    invoiced_amount: item?.invoiced_amount,
                    supplier: item?.product?.supplier?.supplier_name,
                    uom: item?.product?.uom?.name,
                    item_code: item?.item_code,
                    need_by_date: item?.need_by_date
                        ? dayjs(item?.need_by_date).format("DD-MM-YYYY") : "",
                    budget_line_id: item?.budget_line?.budget_line,
                    budget_period_id: item?.budget_period?.budget_period,
                    cost_center_id: item?.cost_center?.cost_center,
                    item_total: item?.item_total,
                    created_at: item?.created_at,
                    item_number: item?.item_number,
                    line_tax_amount: item?.line_tax_amount,
                    ordered_quantity: item?.ordered_quantity,
                }))
                .filter((item: any) => item.id)
                .sort((a: any, b: any) => {
                    if (a.item_number && b.item_number) {
                        return a.item_number.localeCompare(b.item_number);
                    }
                    return 0;
                });
            setItemDetails(mappedItems);
        }
    }, [details]);

    const handleDeleteLineItem = async (id: string) => {
        setRowLoading(id);
        try {
            await viewAPI.deleteChild(
                "invoice",
                requisitionId,
                "invoice_view",
                "invoice_line_item",
                id
            )
                .then((res) => {
                    setDetails(res);
                })
                .catch((error) => {
                    console.log("error", error);
                });
        } finally {
            setRowLoading(null);
        }
    };

    const onSubmit = async (data: any) => {
        if (!requisitionId || !editableField.id) return;
        try {
            setRowLoading(editableField.id);
            await viewAPI.updateChild(
                "invoice",
                requisitionId,
                "invoice_view",
                "invoice_line_item",
                editableField.id,
                data
            )
                .then((res: any) => {
                    setDetails(res.data);
                    setEditableField({ id: null, field: null });
                })
                .catch((error: any) => {
                    console.error("Error updating line item:", error);
                });
        } catch (error) {
            console.error("Error in onSubmit:", error);
        } finally {
            setRowLoading(null);
        }
    };

    const handleFieldUpdate = async (id: string, fieldName: string, value: any) => {
        if (readOnly) return;

        if (fieldName === 'invoice_qty') {
            if (!value) return;
            const record = itemDetails.find(item => item.id === id);
            if (value > record.ordered_quantity) {
                toast({
                    title: "Invoice Quantity cannot be greater than Ordered Quantity",
                    description: `Your ordered quantity is ${record.ordered_quantity}. Please enter a quantity less than or equal to this.`,
                });
                return;
            }
            const updatedItems = itemDetails.map(item =>
                item.id === id ? { ...item, invoice_qty: value } : item
            );
            setItemDetails(updatedItems);
        }

        setEditableField({ id: id, field: fieldName });
        await onSubmit({ [fieldName]: value });
        setEditableField({ id: null, field: null });
    };

    const columns = [
        {
            title: 'Item Code',
            dataIndex: 'item_name',
            key: 'item_name',
        },
        {
            title: 'Invoice Quantity',
            dataIndex: 'invoice_qty',
            key: 'invoice_qty',
            align: 'center' as const,
            render: (text: any, record: any) => {
                const isEditing = editableField.id === record.id && editableField.field === 'invoice_qty';
                return (
                    <EditableCell
                        isEditing={isEditing}
                        value={text}
                        onEdit={() => setEditableField({ id: record.id, field: 'invoice_qty' })}
                        readOnly={readOnly}
                    >
                        {isEditing ? (
                            <InputNumber
                                min={1}
                                defaultValue={text}
                                style={{ width: '100px' }}
                                onChange={(value) => {
                                    const updatedItems = itemDetails.map(item =>
                                        item.id === record.id ? { ...item, invoice_qty: value } : item
                                    );
                                    setItemDetails(updatedItems);
                                    setTempQuantity(value);
                                }}
                                onBlur={() => {
                                    if (tempQuantity !== null) {
                                        handleFieldUpdate(record.id, 'invoice_qty', tempQuantity);
                                        setTempQuantity(null);
                                    }
                                    setEditableField({ id: null, field: null });
                                }}
                                autoFocus
                            />
                        ) : (
                            text || null
                        )}
                    </EditableCell>
                );
            },
        },
        {
            title: 'Tax Rate',
            dataIndex: 'tax_rate',
            key: 'tax_rate',
            align: 'center' as const,
            render: (text: any, record: any) => {
                const isEditing = editableField.id === record.id && editableField.field === 'tax_rate';
                return (
                    <EditableCell
                        isEditing={isEditing}
                        value={text}
                        onEdit={() => setEditableField({ id: record.id, field: 'tax_rate' })}
                        readOnly={readOnly}
                    >
                        {isEditing ? (
                            <InputNumber
                                min={1}
                                defaultValue={text}
                                style={{ width: '100px' }}
                                onChange={(value) => {
                                    const updatedItems = itemDetails.map(item =>
                                        item.id === record.id ? { ...item, tax_rate: value } : item
                                    );
                                    setItemDetails(updatedItems);
                                    setTempQuantity(value);
                                }}
                                onBlur={() => {
                                    if (tempQuantity !== null) {
                                        handleFieldUpdate(record.id, 'tax_rate', tempQuantity);
                                        setTempQuantity(null);
                                    }
                                    setEditableField({ id: null, field: null });
                                }}
                                autoFocus
                            />
                        ) : (
                            text || null
                        )}
                    </EditableCell>
                );
            },
        },
        {
            title: 'Rate',
            dataIndex: 'rate',
            key: 'rate',
            align: 'right' as const,
        },
        {
            title: 'Line Tax Amount',
            dataIndex: 'line_tax_amount',
            key: 'line_tax_amount',
            align: 'right' as const,
        },
        {
            title: 'Line Total',
            dataIndex: 'line_total',
            key: 'line_total',
            align: 'right' as const,
        },
    ];

    columns.push({
        title: 'Actions',
        dataIndex: 'actions',
        key: 'actions',
        align: 'center' as const,
        render: (_: any, record: any) => (
            <Space size="middle">
                {isRowLoading === record.id ? (
                    <Spin indicator={<LoadingOutlined spin />} />
                ) : (
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteLineItem(record.id)}
                        size="small"
                        disabled={readOnly}
                    />
                )}
            </Space>
        ),
    });

    return (
        <Card
            title="Invoice Line Items"
        >
            <div ref={tableContainerRef}>
                <Table
                    columns={columns}
                    dataSource={itemDetails}
                    rowKey="id"
                    pagination={false}
                    locale={{
                        emptyText: "No items added yet. Click 'Add Item' to add a line item."
                    }}
                />
            </div>
        </Card>
    );
};

export default InvoiceLineItemsTable;
