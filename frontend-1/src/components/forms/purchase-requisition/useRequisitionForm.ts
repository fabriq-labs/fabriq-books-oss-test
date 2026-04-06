
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { PurchaseRequisition } from '@/models/PurchaseRequisition';
import { useWorkflowTransitions } from '@/hooks/useWorkflowTransitions';

// Form schema
export const purchaseRequisitionSchema = z.object({
  prNumber: z.string().optional(),
  prDate: z.date().default(new Date()),
  requester: z.string().min(1, { message: "Requester is required" }),
  requesterDepartment: z.string().min(1, { message: "Requester department is required" }),
  onBehalfOf: z.boolean().default(false),
  onBehalfOfUser: z.string().optional(),
  onBehalfOfDepartment: z.string().optional(),
  purchaseReason: z.string().min(1, { message: "Purchase reason is required" }),
  deliveryLocation: z.string().min(1, { message: "Delivery location is required" }),
  deliverTo: z.string().min(1, { message: "Deliver to is required" }),
  legalEntity: z.string().min(1, { message: "Legal entity is required" }),
  isBudgeted: z.boolean().default(false),
  budgetLevel: z.enum(["Header", "Line"]).optional(),
  costCenter: z.string().optional(),
  budgetPeriod: z.string().optional(),
  budgetLine: z.string().optional(),
  isForProject: z.boolean().default(false),
  projectName: z.string().optional(),
  purchaseTotal: z.number().min(0).default(0),
  prStatus: z.enum([
    "Draft",
    "Department Approval",
    "Finance Approval",
    "Procurement Approval",
    "Approved",
    "Pending Completion",
    "Completed",
    "Rejected"
  ]).default("Draft"),
});

export type PurchaseRequisitionFormValues = z.infer<typeof purchaseRequisitionSchema>;

export const useRequisitionForm = (onComplete?: () => void, requisitionId?: string, readOnly: boolean = false) => {
  const { toast } = useToast();
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [currentLineItem, setCurrentLineItem] = useState<any>({
    id: '',
    itemCode: '',
    itemImage: '',
    itemDescription: '',
    quantity: 1,
    rate: 0,
    itemTotal: 0,
    costCenter: '',
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize the form
  const form = useForm<PurchaseRequisitionFormValues>({
    resolver: zodResolver(purchaseRequisitionSchema),
    defaultValues: {
      prNumber: ``,
      prDate: new Date(),
      requester: '',
      requesterDepartment: '',
      onBehalfOf: false,
      purchaseReason: '',
      deliveryLocation: '',
      deliverTo: '',
      legalEntity: '',
      isBudgeted: false,
      isForProject: false,
      purchaseTotal: 0,
      prStatus: 'Draft',
    },
  });

  // Initialize the workflow transitions - moved after form declaration
  const {
    executeTransition,
    getFirstTransition
  } = useWorkflowTransitions(
    "Purchase Requisition",
    requisitionId ? form.getValues().prStatus : "Draft",
    requisitionId
  );

  // Function to refresh the requisition data
  const refreshRequisition = useCallback(async () => {
    // if (requisitionId) {
    //   setIsLoading(true);
    //   try {
    //     const result = await getPurchaseRequisitionById(requisitionId);
    //     if (result.success && result.requisition) {
    //       // Format the data for the form
    //       const requisition = result.requisition;

    //       form.reset({
    //         prNumber: requisition.pr_number,
    //         prDate: new Date(requisition.pr_date),
    //         requester: requisition.requester,
    //         requesterDepartment: requisition.requester_department,
    //         onBehalfOf: requisition.on_behalf_of,
    //         onBehalfOfUser: requisition.on_behalf_of_user,
    //         onBehalfOfDepartment: requisition.on_behalf_of_department,
    //         purchaseReason: requisition.purchase_reason,
    //         deliveryLocation: requisition.delivery_location,
    //         deliverTo: requisition.deliver_to,
    //         legalEntity: requisition.legal_entity,
    //         isBudgeted: requisition.is_budgeted,
    //         budgetLevel: requisition.budget_level as "Header" | "Line" | undefined,
    //         costCenter: requisition.cost_center,
    //         budgetPeriod: requisition.budget_period,
    //         budgetLine: requisition.budget_line,
    //         isForProject: requisition.is_for_project,
    //         projectName: requisition.project_name,
    //         purchaseTotal: requisition.purchase_total,
    //         prStatus: requisition.pr_status as PurchaseRequisition['pr_status'],
    //       });

    //       // Load line items
    //       if (result.lineItems && result.lineItems.length > 0) {
    //         const formattedLineItems = result.lineItems.map((item: any) => ({
    //           id: item.id,
    //           itemCode: item.item_code,
    //           itemImage: item.item_image,
    //           itemDescription: item.item_description,
    //           quantity: item.quantity,
    //           rate: item.rate,
    //           itemTotal: item.item_total,
    //           costCenter: item.cost_center,
    //         }));
    //         setLineItems(formattedLineItems);
    //       }
    //     } else {
    //       toast({
    //         title: "Error",
    //         description: "Failed to load requisition data. Please try again.",
    //         variant: "destructive",
    //       });
    //     }
    //   } catch (error) {
    //     console.error("Error loading requisition:", error);
    //     toast({
    //       title: "Error",
    //       description: "An unexpected error occurred. Please try again.",
    //       variant: "destructive",
    //     });
    //   } finally {
    //     setIsLoading(false);
    //   }
    // }
  }, [requisitionId, form, toast]);

  // Load requisition data if ID is provided
  // useEffect(() => {
  //   if (requisitionId) {
  //     const loadRequisition = async () => {
  //       setIsLoading(true);
  //       try {
  //         const result = await getPurchaseRequisitionById(requisitionId);
  //         if (result.success && result.requisition) {
  //           // Format the data for the form
  //           const requisition = result.requisition;

  //           form.reset({
  //             prNumber: requisition.pr_number,
  //             prDate: new Date(requisition.pr_date),
  //             requester: requisition.requester,
  //             requesterDepartment: requisition.requester_department,
  //             onBehalfOf: requisition.on_behalf_of,
  //             onBehalfOfUser: requisition.on_behalf_of_user,
  //             onBehalfOfDepartment: requisition.on_behalf_of_department,
  //             purchaseReason: requisition.purchase_reason,
  //             deliveryLocation: requisition.delivery_location,
  //             deliverTo: requisition.deliver_to,
  //             legalEntity: requisition.legal_entity,
  //             isBudgeted: requisition.is_budgeted,
  //             budgetLevel: requisition.budget_level as "Header" | "Line" | undefined,
  //             costCenter: requisition.cost_center,
  //             budgetPeriod: requisition.budget_period,
  //             budgetLine: requisition.budget_line,
  //             isForProject: requisition.is_for_project,
  //             projectName: requisition.project_name,
  //             purchaseTotal: requisition.purchase_total,
  //             prStatus: requisition.pr_status as PurchaseRequisition['pr_status'],
  //           });

  //           // Load line items
  //           if (result.lineItems && result.lineItems.length > 0) {
  //             const formattedLineItems = result.lineItems.map((item: any) => ({
  //               id: item.id,
  //               itemCode: item.item_code,
  //               itemImage: item.item_image,
  //               itemDescription: item.item_description,
  //               quantity: item.quantity,
  //               rate: item.rate,
  //               itemTotal: item.item_total,
  //               costCenter: item.cost_center,
  //             }));
  //             setLineItems(formattedLineItems);
  //           }
  //         } else {
  //           toast({
  //             title: "Error",
  //             description: "Failed to load requisition data. Please try again.",
  //             variant: "destructive",
  //           });
  //         }
  //       } catch (error) {
  //         console.error("Error loading requisition:", error);
  //         toast({
  //           title: "Error",
  //           description: "An unexpected error occurred. Please try again.",
  //           variant: "destructive",
  //         });
  //       } finally {
  //         setIsLoading(false);
  //       }
  //     };

  //     loadRequisition();
  //   }
  // }, [requisitionId, form, toast]);
  useEffect(() => {
    if (requisitionId) {
      refreshRequisition();
    }
  }, [requisitionId, refreshRequisition]);

  const updateTotalAmount = (items: any[]) => {
    const total = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    form.setValue('purchaseTotal', total);
  };

  // Save as draft function
  const saveAsDraft = async () => {
    setIsSubmitting(true);
    try {
      const values = form.getValues();
      values.prStatus = 'Draft';

      // Format and submit
      const formattedLineItems = lineItems.map(item => ({
        item_code: item.itemCode,
        item_image: item.itemImage,
        item_description: item.itemDescription,
        quantity: item.quantity,
        rate: item.rate,
        item_total: item.itemTotal,
        cost_center: item.costCenter,
      }));

      // Convert form data to match the database schema
      const requisitionData: Omit<PurchaseRequisition, 'id' | 'created_at' | 'updated_at'> = {
        pr_number: values.prNumber,
        pr_date: values.prDate,
        requester: values.requester,
        requester_department: values.requesterDepartment,
        on_behalf_of: values.onBehalfOf,
        on_behalf_of_user: values.onBehalfOfUser,
        on_behalf_of_department: values.onBehalfOfDepartment,
        purchase_reason: values.purchaseReason,
        delivery_location: values.deliveryLocation,
        deliver_to: values.deliverTo,
        legal_entity: values.legalEntity,
        is_budgeted: values.isBudgeted,
        budget_level: values.budgetLevel,
        cost_center: values.costCenter,
        budget_period: values.budgetPeriod,
        budget_line: values.budgetLine,
        is_for_project: values.isForProject,
        project_name: values.projectName,
        purchase_total: values.purchaseTotal,
        pr_status: values.prStatus,
        attachments: [],
      };

      // const result = await createPurchaseRequisition(requisitionData, formattedLineItems);

      // if (result.success) {
      //   toast({
      //     title: "Draft Saved",
      //     description: `PR Number: ${values.prNumber} has been saved as draft.`,
      //   });
      // } else {
      //   toast({
      //     title: "Error",
      //     description: "Failed to save draft. Please try again.",
      //     variant: "destructive",
      //   });
      // }
    } catch (error) {
      console.error("Error saving draft:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (values: PurchaseRequisitionFormValues, triggerFirstTransition: boolean = false) => {
    if (readOnly) return; // Don't submit if in read-only mode

    console.log('Submitting form with values:', values);

    setIsSubmitting(true);
    try {
      // Format data for API submission
      const formattedLineItems = lineItems.map(item => ({
        item_code: item.itemCode,
        item_image: item.itemImage,
        item_description: item.itemDescription,
        quantity: item.quantity,
        rate: item.rate,
        item_total: item.itemTotal,
        cost_center: item.costCenter,
      }));

      // Convert form data to match the database schema
      const requisitionData: Omit<PurchaseRequisition, 'id' | 'created_at' | 'updated_at'> = {
        pr_number: values.prNumber,
        pr_date: values.prDate,
        requester: values.requester,
        requester_department: values.requesterDepartment,
        on_behalf_of: values.onBehalfOf,
        on_behalf_of_user: values.onBehalfOfUser,
        on_behalf_of_department: values.onBehalfOfDepartment,
        purchase_reason: values.purchaseReason,
        delivery_location: values.deliveryLocation,
        deliver_to: values.deliverTo,
        legal_entity: values.legalEntity,
        is_budgeted: values.isBudgeted,
        budget_level: values.budgetLevel,
        cost_center: values.costCenter,
        budget_period: values.budgetPeriod,
        budget_line: values.budgetLine,
        is_for_project: values.isForProject,
        project_name: values.projectName,
        purchase_total: values.purchaseTotal,
        pr_status: values.prStatus,
        attachments: [],
      };

      console.log('Submitting requisition data:', requisitionData);

      // Submit to Supabase
      // const result = await createPurchaseRequisition(requisitionData, formattedLineItems);

      // if (result.success) {
      //   toast({
      //     title: "Purchase Requisition Submitted",
      //     description: `PR Number: ${values.prNumber} has been saved successfully.`,
      //   });


      //   // If this is a new requisition and we're supposed to trigger the first available transition
      //   if (triggerFirstTransition && result.id) {
      //     const firstTransition = getFirstTransition();
      //     if (firstTransition) {
      //       // Execute the transition with the newly created requisition ID
      //       const transitionSuccess = await executeTransition(firstTransition.to_state);
      //       if (transitionSuccess) {
      //         toast({
      //           title: "Workflow Advanced",
      //           description: `Workflow advanced to ${firstTransition.to_state}`
      //         });
      //       }
      //     }
      //   }

      //   // Call the onComplete callback if provided
      //   if (onComplete) {
      //     onComplete();
      //   }
      // } else {
      //   toast({
      //     title: "Error",
      //     description: "Failed to submit purchase requisition. Please try again.",
      //     variant: "destructive",
      //   });
      // }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    form,
    lineItems,
    setLineItems,
    editingRowId,
    setEditingRowId,
    currentLineItem,
    setCurrentLineItem,
    currentStep,
    setCurrentStep,
    updateTotalAmount,
    onSubmit,
    saveAsDraft,
    isSubmitting,
    isLoading,
    requisitionId,
    refreshRequisition
  };
};
