import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchDropDown } from '../../search_dropdown/dropdown';
import { constructObject } from '../../utils/helper';
import { viewAPI } from '@/api/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { HQAccountMappingTab } from './HQAccountMappingTab';

const FINANCIAL_YEAR_OPTIONS = [
  { value: 'APR_MAR', label: 'April – March (India / UK)' },
  { value: 'JAN_DEC', label: 'January – December (Calendar Year)' },
  { value: 'JUL_JUN', label: 'July – June (Australia)' },
  { value: 'OCT_SEP', label: 'October – September' },
] as const;

const organizationSchema = z.object({
  organization_name: z.string().min(1, { message: 'Organization Name is required' }),
  legal_name: z.string().min(1, { message: 'Legal Name is required' }),
  address: z.string().min(1, { message: 'Address is required' }),
  city: z.string().min(1, { message: 'City is required' }),
  state: z.string().min(1, { message: 'State is required' }),
  country: z.string().min(1, { message: 'Country is required' }),
  zip_code: z.string().min(1, { message: 'Zip Code is required' }),
  website: z.string().optional(),
  is_it_headquartres: z.string().min(1, { message: 'Is it Headquarters is required' }),
  is_it_a_groupcompany: z.string().min(1, { message: 'Is it a Group Company is required' }),
  group_company_name: z.string().optional(),
  basecurrency_id: z.string().optional(),
  is_individual: z.string().optional(),
  financial_year_type: z.enum(['APR_MAR', 'JAN_DEC', 'JUL_JUN', 'OCT_SEP']).optional(),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

interface ItemMasterFormProps {
  initialValues?: any;
  onSubmit?: (data: any) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export const OrganizationForm: React.FC<ItemMasterFormProps> = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [initialValues, setInitialValues] = useState<any>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      organization_name: '',
      legal_name: '',
      address: '',
      city: '',
      state: '',
      country: '',
      zip_code: '',
      website: '',
      basecurrency_id: '',
      is_it_headquartres: '',
      is_it_a_groupcompany: '',
      is_individual: '',
      financial_year_type: undefined,
    },
  });

  useEffect(() => {
    if (id) fetchingDetails(id);
  }, [id]);

  const fetchingDetails = (id: string) => {
    setIsLoading(true);
    viewAPI.getById("entity", id, viewId)
      .then((res: any) => {
        setInitialValues(res.data);
        form.reset({
          organization_name: res.data.organization_name || '',
          legal_name: res.data.legal_name || '',
          address: res.data.address || '',
          city: res.data.city || '',
          state: res.data.state || '',
          country: res.data.country || '',
          zip_code: res.data.zip_code || '',
          website: res.data.website || '',
          basecurrency_id: res.data.basecurrency_id || '',
          is_it_headquartres: res.data.is_it_headquartres || '',
          is_it_a_groupcompany: res.data.is_it_a_groupcompany || '',
          is_individual: res.data.is_individual != null ? String(res.data.is_individual) : '',
          financial_year_type: res.data.financial_year_type || undefined,
        });
        setIsLoading(false);
      })
      .catch((err) => {
        setIsLoading(false);
        console.log(err);
      });
  };

  const handleSubmit = async (data: OrganizationFormValues) => {
    try {
      setIsSubmitting(true);
      const submissionData = {
        ...data,
        basecurrency_id: data.basecurrency_id || undefined,
        is_individual: data.is_individual === 'true' ? true : data.is_individual === 'false' ? false : undefined,
        financial_year_type: data.financial_year_type || undefined,
      };

      if (!id) {
        await viewAPI.create("entity", viewId, submissionData);
        toast({ title: "Success", description: "Entity created successfully" });
      } else {
        await viewAPI.update("entity", id, viewId, submissionData);
        toast({ title: "Success", description: "Entity updated successfully" });
      }
      navigate('/masters/entity');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Something went wrong" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectChange = (sourceKey: any, key: string, value: any, fields: any) => {
    constructObject(value.item, fields);
    form.setValue(sourceKey, value[key]);
  };

  const handleSelectClear = (sourceKey: any) => {
    form.setValue(sourceKey, '');
  };

  const handleCancel = () => navigate('/masters/entity');

  const isSubEntity = initialValues?.is_it_headquartres !== 'Yes';
  const showTabs = id && isSubEntity;

  const loadingSkeleton = (
    <div className="space-y-6">
      <div><Skeleton className="h-4 w-[100px] mb-2" /><Skeleton className="h-10 w-full" /></div>
      <div><Skeleton className="h-4 w-[120px] mb-2" /><Skeleton className="h-10 w-full" /></div>
      <div className="flex justify-end space-x-2">
        <Skeleton className="h-10 w-[100px]" /><Skeleton className="h-10 w-[100px]" />
      </div>
    </div>
  );

  const formContent = isLoading ? loadingSkeleton : (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField control={form.control} name="organization_name" render={({ field }) => (
            <FormItem><FormLabel>Organization Name <span className="text-red-500">*</span></FormLabel>
              <FormControl><Input placeholder="Enter Organization Name" {...field} /></FormControl>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="legal_name" render={({ field }) => (
            <FormItem><FormLabel>Legal Name <span className="text-red-500">*</span></FormLabel>
              <FormControl><Input placeholder="Enter Legal Name" {...field} /></FormControl>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="address" render={({ field }) => (
            <FormItem><FormLabel>Address <span className="text-red-500">*</span></FormLabel>
              <FormControl><Input placeholder="Enter Address" {...field} /></FormControl>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="city" render={({ field }) => (
            <FormItem><FormLabel>City <span className="text-red-500">*</span></FormLabel>
              <FormControl><Input placeholder="Enter City" {...field} /></FormControl>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="state" render={({ field }) => (
            <FormItem><FormLabel>State <span className="text-red-500">*</span></FormLabel>
              <FormControl><Input placeholder="Enter State" {...field} /></FormControl>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="country" render={({ field }) => (
            <FormItem><FormLabel>Country <span className="text-red-500">*</span></FormLabel>
              <FormControl><Input placeholder="Enter Country" {...field} /></FormControl>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="zip_code" render={({ field }) => (
            <FormItem><FormLabel>Zip Code <span className="text-red-500">*</span></FormLabel>
              <FormControl><Input placeholder="Enter Zip Code" {...field} /></FormControl>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="website" render={({ field }) => (
            <FormItem><FormLabel>Website</FormLabel>
              <FormControl><Input placeholder="https://example.com" {...field} /></FormControl>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="basecurrency_id" render={({ field }) => (
            <FormItem><FormLabel>Base Currency</FormLabel>
              <SearchDropDown
                instanceType="currency"
                instanceSourceKey="basecurrency_id"
                instanceKey="id"
                instanceLabel="code"
                instanceValue={initialValues?.currency}
                onSelectItem={handleSelectChange}
                onClear={handleSelectClear}
                limit="10"
                searchParams="code"
                type={showTabs ? "entity" : "organization"}
              />
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="is_it_headquartres" render={({ field }) => (
            <FormItem><FormLabel>Is It Headquarters <span className="text-red-500">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="is_it_a_groupcompany" render={({ field }) => (
            <FormItem><FormLabel>Is It a Group Company <span className="text-red-500">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="is_individual" render={({ field }) => (
            <FormItem><FormLabel>Is Individual</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="financial_year_type" render={({ field }) => (
            <FormItem><FormLabel>Financial Year</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select financial year" /></SelectTrigger></FormControl>
                <SelectContent>
                  {FINANCIAL_YEAR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage /></FormItem>
          )} />
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">Save</Button>
        </div>
      </form>
    </Form>
  );

  return (
    <div className="mx-auto w-[70%]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organization</h1>
          <p className="text-sm text-gray-600 mt-1">
            {initialValues ? 'Edit Organization' : 'Create New Organization'}
          </p>
        </div>
        <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground" onClick={() => navigate('/masters/entity')}>
          <ArrowLeft size={16} />
          Back to list
        </Button>
      </div>

      {showTabs ? (
        <Tabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="hq-mapping">HQ Account Mapping</TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            <Card>
              <CardHeader><CardTitle /></CardHeader>
              <CardContent>{formContent}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="hq-mapping">
            {id ? (
              <HQAccountMappingTab organizationId={id} orgId={initialValues?.org_id || ''} />
            ) : (
              <Card><CardContent><div className="text-center py-8 text-muted-foreground">Organization ID is required</div></CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardHeader><CardTitle /></CardHeader>
          <CardContent>{formContent}</CardContent>
        </Card>
      )}
    </div>
  );
};
