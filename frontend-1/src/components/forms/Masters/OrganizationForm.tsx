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
});

type ItemMasterValues = z.infer<typeof organizationSchema>;

interface ItemMasterFormProps {
  initialValues?: any;
  onSubmit?: (data: any) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  uomOptions?: any[];
  itemCategoryOptions?: any[];
  supplierOptions?: any[];
}

export const OrganizationForm: React.FC<ItemMasterFormProps> = (
) => {
  const { id, viewId } = useParams<{ id: string, viewId: string }>();
  const [initialValues, setInitialValues] = useState<any>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const form = useForm<ItemMasterValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: initialValues || {
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
    },
  });
  useEffect(() => {
    if (id) {
      fetchingDetails(id);
    }
  }, [id])

  const fetchingDetails = (id: any) => {
    setIsLoading(true);
    viewAPI.getById("organization", id, viewId)
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
        });
        setIsLoading(false);
      }).catch((err) => {
        setIsLoading(false);
        console.log(err);
      });
  };

  const handleSubmit = async (data: ItemMasterValues) => {
    try {
      setIsSubmitting(true);

      const submissionData = {
        ...data,
        basecurrency_id: data.basecurrency_id || undefined,
      };

      if (!id) {
        await viewAPI.create(
          "organization",
          viewId,
          submissionData
        );
        toast({
          title: "Success",
          description: "Organization created successfully",
        });
        navigate('/masters/organization');
      } else {
        await viewAPI.update(
          "organization",
          id,
          viewId,
          submissionData
        );
        toast({
          title: "Success",
          description: "Organization updated successfully",
        });
      }
      navigate('/masters/organization');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Something went wrong",
      });
      console.error("Error:", error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectChange = (
    sourceKey: any,
    key: string,
    value: any,
    fields: any
  ) => {
    const lookupData = constructObject(value.item, fields);
    form.setValue(sourceKey, value[key]);
  };

  const handleSelectClear = (sourceKey: any) => {
    form.setValue(sourceKey, '');
  };



  const handleCancel = () => {
    navigate('/masters/organization');
  };

  const isSubEntity = initialValues?.is_it_headquartres !== 'Yes';
  const showTabs = id && isSubEntity;

  return (

    <div className="mx-auto w-[70%]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organization Master</h1>
          <p className="text-sm text-gray-600 mt-1">
            {initialValues ? 'Edit Organization' : 'Create New Organization'}
          </p>
        </div>
        <Button
          variant="ghost"
          className="flex items-center gap-2 text-muted-foreground"
          onClick={() => navigate('/masters/organization')}
        >
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
              <CardHeader>
                <CardTitle>
                  {/* {initialValues ? 'Edit Item Category' : 'Create Item Category'} */}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-6">
                    <div>
                      <Skeleton className="h-4 w-[100px] mb-2" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                    <div>
                      <Skeleton className="h-4 w-[120px] mb-2" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Skeleton className="h-10 w-[100px]" />
                      <Skeleton className="h-10 w-[100px]" />
                    </div>
                  </div>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="organization_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Organization Name <span className="text-red-500">*</span></FormLabel>
                              <FormControl>
                                <Input placeholder="Enter Organization Name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="legal_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Legal Name <span className="text-red-500">*</span></FormLabel>
                              <FormControl>
                                <Input placeholder="Enter Legal Name " {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="address"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Address <span className="text-red-500">*</span></FormLabel>
                              <FormControl>
                                <Input placeholder="Enter Address" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>City <span className="text-red-500">*</span></FormLabel>
                              <FormControl>
                                <Input placeholder="Enter City" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State <span className="text-red-500">*</span></FormLabel>
                              <FormControl>
                                <Input placeholder="Enter State" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="country"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Country <span className="text-red-500">*</span></FormLabel>
                              <FormControl>
                                <Input placeholder="Enter Country" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="zip_code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Zip Code <span className="text-red-500">*</span></FormLabel>
                              <FormControl>
                                <Input placeholder="Enter Zip Code" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="website"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Website</FormLabel>
                              <FormControl>
                                <Input placeholder="https://example.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="basecurrency_id"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Base Currency</FormLabel>
                              <SearchDropDown
                                instanceType="currency_master"
                                instanceSourceKey="basecurrency_id"
                                instanceKey="id"
                                instanceLabel="base_currency"
                                instanceValue={
                                  initialValues?.currency_master
                                }
                                onSelectItem={handleSelectChange}
                                onClear={handleSelectClear}
                                limit="10"
                                searchParams="base_currency"
                                type="organization"
                              />
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="is_it_headquartres"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Is It Headquarters <span className="text-red-500">*</span></FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Headquarters" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Yes">Yes</SelectItem>
                                  <SelectItem value="No">No</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="is_it_a_groupcompany"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Is It a Group Company <span className="text-red-500">*</span></FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Group Company" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Yes">Yes</SelectItem>
                                  <SelectItem value="No">No</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex justify-end space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCancel}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={isSubmitting}
                          className="bg-primary hover:bg-primary/90"
                        >
                          Save
                        </Button>
                      </div>
                    </form>
                  </Form>)}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="hq-mapping">
            {id ? (
              <HQAccountMappingTab
                organizationId={id}
                orgId={initialValues?.org_id || ''}
              />
            ) : (
              <Card>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    Organization ID is required
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {/* {initialValues ? 'Edit Item Category' : 'Create Item Category'} */}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-6">
                <div>
                  <Skeleton className="h-4 w-[100px] mb-2" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div>
                  <Skeleton className="h-4 w-[120px] mb-2" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="flex justify-end space-x-2">
                  <Skeleton className="h-10 w-[100px]" />
                  <Skeleton className="h-10 w-[100px]" />
                </div>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="organization_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organization Name <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Enter Organization Name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="legal_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Legal Name <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Enter Legal Name " {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Enter Address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Enter City" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Enter State" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Enter Country" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="zip_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zip Code <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Enter Zip Code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website</FormLabel>
                          <FormControl>
                            <Input placeholder="https://example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="basecurrency_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Base Currency</FormLabel>
                          <SearchDropDown
                            instanceType="currency_master"
                            instanceSourceKey="basecurrency_id"
                            instanceKey="id"
                            instanceLabel="base_currency"
                            instanceValue={
                              initialValues?.currency_master
                            }
                            onSelectItem={handleSelectChange}
                            onClear={handleSelectClear}
                            limit="10"
                            searchParams="base_currency"
                            type="organization"
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_it_headquartres"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Is It Headquarters <span className="text-red-500">*</span></FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Headquarters" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Yes">Yes</SelectItem>
                              <SelectItem value="No">No</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_it_a_groupcompany"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Is It a Group Company <span className="text-red-500">*</span></FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Group Company" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Yes">Yes</SelectItem>
                              <SelectItem value="No">No</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancel}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-primary hover:bg-primary/90"
                    >
                      Save
                    </Button>
                  </div>
                </form>
              </Form>)}
          </CardContent>
        </Card>
      )}
    </div>

  );
};