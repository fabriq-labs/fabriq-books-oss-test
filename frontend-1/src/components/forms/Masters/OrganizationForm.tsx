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
import { useAuth } from '@/contexts/AuthContext';
import { HQAccountMappingTab } from './HQAccountMappingTab';
import { TaxRegistrationsTab } from './TaxRegistrationsTab';

const ENTITY_TAX_SETTINGS_VIEW = 'entity_tax_settings_view';

const FINANCIAL_YEAR_OPTIONS = [
  { value: 'APR_MAR', label: 'April – March (India / UK)' },
  { value: 'JAN_DEC', label: 'January – December (Calendar Year)' },
  { value: 'JUL_JUN', label: 'July – June (Australia)' },
  { value: 'OCT_SEP', label: 'October – September' },
] as const;

const TAX_TREATMENT_OPTIONS = [
  { value: 'registered', label: 'Registered' },
  { value: 'export', label: 'Export / overseas' },
  { value: 'sez', label: 'SEZ' },
  { value: 'composition', label: 'Composition' },
  { value: 'unregistered', label: 'Unregistered' },
] as const;

const TAX_COUNTRY_PACK_OPTIONS = [
  { value: 'IN', label: 'India (GST)' },
  { value: 'CA', label: 'Canada (GST/HST/PST)' },
  { value: 'GENERIC', label: 'Generic' },
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
  tax_country_pack: z.enum(['IN', 'CA', 'GENERIC']),
  tax_treatment: z.string().optional(),
  default_tax_region_id: z.string().optional().nullable(),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

interface ItemMasterFormProps {
  initialValues?: any;
  onSubmit?: (data: any) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

async function findEntityTaxSettings(legalEntityId: string): Promise<any | null> {
  const res: any = await viewAPI.search(
    'entity_tax_settings',
    ENTITY_TAX_SETTINGS_VIEW,
    1,
    1,
    undefined,
    { legal_entity_id: { eq: legalEntityId } },
  );
  const rows = res?.data || [];
  return rows[0] || null;
}

export const OrganizationForm: React.FC<ItemMasterFormProps> = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const [initialValues, setInitialValues] = useState<any>();
  const [entityTaxSettingsId, setEntityTaxSettingsId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
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
      tax_country_pack: 'GENERIC',
      tax_treatment: '',
      default_tax_region_id: null,
    },
  });

  const taxCountryPack = form.watch('tax_country_pack');
  const taxRegionFilters =
    taxCountryPack === 'IN' || taxCountryPack === 'CA'
      ? { country_code: { eq: taxCountryPack } }
      : undefined;

  useEffect(() => {
    if (id) void fetchingDetails(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchingDetails = async (entityId: string) => {
    setIsLoading(true);
    try {
      const res: any = await viewAPI.getById('entity', entityId, viewId);
      let pack: 'IN' | 'CA' | 'GENERIC' = 'GENERIC';
      try {
        const settings = await findEntityTaxSettings(entityId);
        if (settings?.id) {
          setEntityTaxSettingsId(settings.id);
          const raw = String(settings.tax_country_pack || 'GENERIC').toUpperCase();
          if (raw === 'IN' || raw === 'CA' || raw === 'GENERIC') pack = raw;
        } else {
          setEntityTaxSettingsId(null);
        }
      } catch {
        setEntityTaxSettingsId(null);
      }

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
        tax_country_pack: pack,
        tax_treatment: res.data.tax_treatment || '',
        default_tax_region_id: res.data.default_tax_region_id || null,
      });
    } catch (err) {
      console.log(err);
    } finally {
      setIsLoading(false);
    }
  };

  const upsertEntityTaxSettings = async (
    legalEntityId: string,
    orgId: string,
    pack: 'IN' | 'CA' | 'GENERIC',
  ) => {
    const payload = {
      legal_entity_id: legalEntityId,
      org_id: orgId,
      tax_country_pack: pack,
      enable_tax_responsibility: pack === 'IN',
    };

    let settingsId = entityTaxSettingsId;
    if (!settingsId) {
      const existing = await findEntityTaxSettings(legalEntityId);
      settingsId = existing?.id || null;
    }

    if (settingsId) {
      await viewAPI.update(
        'entity_tax_settings',
        settingsId,
        ENTITY_TAX_SETTINGS_VIEW,
        payload,
      );
      setEntityTaxSettingsId(settingsId);
    } else {
      const created: any = await viewAPI.create(
        'entity_tax_settings',
        ENTITY_TAX_SETTINGS_VIEW,
        payload,
      );
      setEntityTaxSettingsId(created?.data?.id || created?.id || null);
    }
  };

  const handleSubmit = async (data: OrganizationFormValues) => {
    try {
      setIsSubmitting(true);
      const { tax_country_pack, ...entityFields } = data;
      const submissionData = {
        ...entityFields,
        basecurrency_id: data.basecurrency_id || undefined,
        is_individual:
          data.is_individual === 'true'
            ? true
            : data.is_individual === 'false'
              ? false
              : undefined,
        financial_year_type: data.financial_year_type || undefined,
        tax_treatment: data.tax_treatment || null,
        default_tax_region_id: data.default_tax_region_id || null,
      };

      let legalEntityId = id;
      let orgId = initialValues?.org_id || user?.org_id || '';

      if (!legalEntityId) {
        const created: any = await viewAPI.create('entity', viewId, submissionData);
        legalEntityId = created?.data?.id || created?.id;
        orgId = created?.data?.org_id || orgId;
        if (!legalEntityId) {
          throw new Error('Entity created but id was not returned');
        }
      } else {
        await viewAPI.update('entity', legalEntityId, viewId, submissionData);
        orgId = initialValues?.org_id || orgId;
      }

      if (!orgId) {
        throw new Error('Missing tenant org_id for tax settings');
      }

      await upsertEntityTaxSettings(legalEntityId, orgId, tax_country_pack);

      toast({
        title: 'Success',
        description: id ? 'Entity updated successfully' : 'Entity created successfully',
      });
      navigate('/masters/entity');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Something went wrong',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectChange = (sourceKey: any, key: string, value: any, fields: any) => {
    constructObject(value.item, fields);
    form.setValue(sourceKey, value[key]);
  };

  const handleSelectClear = (sourceKey: any) => {
    form.setValue(sourceKey, sourceKey === 'default_tax_region_id' ? null : '');
  };

  const handleCancel = () => navigate('/masters/entity');

  const isSubEntity = initialValues?.is_it_headquartres !== 'Yes';
  /** Tabs whenever editing an existing LE (tax regs for HQ + branches; HQ mapping for branches). */
  const showTabs = !!id;

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

          <FormField control={form.control} name="tax_country_pack" render={({ field }) => (
            <FormItem>
              <FormLabel>Tax country pack <span className="text-red-500">*</span></FormLabel>
              <Select
                onValueChange={(value) => {
                  field.onChange(value);
                  // Region catalog is pack-scoped; clear stale selection on pack change.
                  form.setValue('default_tax_region_id', null);
                  setInitialValues((prev: any) =>
                    prev ? { ...prev, default_tax_region: null, default_tax_region_id: null } : prev,
                  );
                }}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tax country pack" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TAX_COUNTRY_PACK_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Controls GSTIN/region labels and which tax regions appear for this legal entity.
              </p>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="tax_treatment" render={({ field }) => (
            <FormItem><FormLabel>Tax treatment</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select tax treatment" /></SelectTrigger></FormControl>
                <SelectContent>
                  {TAX_TREATMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage /></FormItem>
          )} />

          <FormField control={form.control} name="default_tax_region_id" render={() => (
            <FormItem><FormLabel>Default tax region</FormLabel>
              <SearchDropDown
                key={`default-tax-region-${taxCountryPack}`}
                instanceType="tax_region"
                instanceSourceKey="default_tax_region_id"
                instanceKey="id"
                instanceLabel="name"
                instanceValue={initialValues?.default_tax_region}
                onSelectItem={handleSelectChange}
                onClear={() => handleSelectClear('default_tax_region_id')}
                limit="20"
                searchParams="name"
                type="entity"
                additionalFilters={taxRegionFilters}
              />
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
            <TabsTrigger value="tax-registrations">Tax Registrations</TabsTrigger>
            {isSubEntity && (
              <TabsTrigger value="hq-mapping">HQ Account Mapping</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="details">
            <Card>
              <CardHeader><CardTitle /></CardHeader>
              <CardContent>{formContent}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="tax-registrations">
            {id ? (
              <TaxRegistrationsTab
                partyType="entity"
                partyId={id}
                orgId={initialValues?.org_id || ''}
                packLegalEntityId={id}
              />
            ) : (
              <Card>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    Save the legal entity first, then add tax registrations.
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          {isSubEntity && (
            <TabsContent value="hq-mapping">
              {id ? (
                <HQAccountMappingTab organizationId={id} orgId={initialValues?.org_id || ''} />
              ) : (
                <Card><CardContent><div className="text-center py-8 text-muted-foreground">Organization ID is required</div></CardContent></Card>
              )}
            </TabsContent>
          )}
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
