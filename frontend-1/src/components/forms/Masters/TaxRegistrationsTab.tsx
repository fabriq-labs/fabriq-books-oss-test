import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { viewAPI } from '@/api/api';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2 } from 'lucide-react';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { fetchEntityTaxPack } from '@/lib/tax/taxLookups';
import { resolveTaxPack, type TaxPackCatalog } from '@/lib/tax/taxPack';

const VIEW = 'party_tax_registration_view';
const MODEL = 'party_tax_registration';

type PartyType = 'entity' | 'customer' | 'supplier';

type RegRow = {
  key: string;
  id?: string;
  scheme: string;
  registration_number: string;
  tax_region_id: string | null;
  tax_region?: { id: string; name?: string; code?: string } | null;
  is_primary: boolean;
  dirty?: boolean;
};

interface TaxRegistrationsTabProps {
  partyType: PartyType;
  partyId: string;
  /** Tenant org_id for create payload */
  orgId: string;
  /**
   * Legal entity id used to resolve country pack labels/schemes.
   * For entity forms pass the same id as partyId; for customers pass seller/HQ LE id.
   */
  packLegalEntityId?: string | null;
}

function newRow(defaultScheme: string, makePrimary: boolean): RegRow {
  return {
    key: `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    scheme: defaultScheme,
    registration_number: '',
    tax_region_id: null,
    tax_region: null,
    is_primary: makePrimary,
    dirty: true,
  };
}

export const TaxRegistrationsTab: React.FC<TaxRegistrationsTabProps> = ({
  partyType,
  partyId,
  orgId,
  packLegalEntityId,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<RegRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [taxPack, setTaxPack] = useState<TaxPackCatalog>(resolveTaxPack('GENERIC'));

  const load = async () => {
    setIsLoading(true);
    try {
      const packId = packLegalEntityId || (partyType === 'entity' ? partyId : null);
      const pack = await fetchEntityTaxPack(packId);
      const catalog = resolveTaxPack(pack);
      setTaxPack(catalog);

      const res: any = await viewAPI.search(MODEL, VIEW, 1, 100, undefined, {
        party_type: { eq: partyType },
        party_id: { eq: partyId },
      });
      const data = res?.data || [];
      setRows(
        data.map((r: any) => ({
          key: r.id,
          id: r.id,
          scheme: r.scheme || catalog.registrationSchemes[0] || 'OTHER',
          registration_number: r.registration_number || '',
          tax_region_id: r.tax_region_id || null,
          tax_region: r.tax_region || null,
          is_primary: !!r.is_primary,
          dirty: false,
        })),
      );
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e?.message || 'Failed to load tax registrations',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (partyId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, partyType, packLegalEntityId]);

  const defaultScheme = taxPack.registrationSchemes[0] || 'OTHER';
  const schemeOptions =
    taxPack.registrationSchemes.length > 0
      ? taxPack.registrationSchemes
      : ['OTHER'];

  const updateRow = (key: string, patch: Partial<RegRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)),
    );
  };

  const handleAdd = () => {
    setRows((prev) => [...prev, newRow(defaultScheme, prev.length === 0)]);
  };

  const handleDelete = async (row: RegRow) => {
    if (!row.id) {
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      return;
    }
    try {
      await viewAPI.delete(MODEL, row.id, VIEW);
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      toast({ title: 'Removed', description: `${taxPack.registrationLabel} deleted` });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e?.message || 'Failed to delete registration',
      });
    }
  };

  const handlePrimary = (key: string, checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key === key) return { ...r, is_primary: checked, dirty: true };
        if (checked && r.is_primary) return { ...r, is_primary: false, dirty: true };
        return r;
      }),
    );
  };

  const handleSave = async () => {
    const toSave = rows.filter((r) => r.dirty || !r.id);
    if (toSave.length === 0) {
      toast({ title: 'Nothing to save', description: 'No registration changes' });
      return;
    }
    for (const r of toSave) {
      if (!r.registration_number.trim()) {
        toast({
          variant: 'destructive',
          title: 'Validation',
          description: `${taxPack.registrationLabel} number is required`,
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      for (const r of toSave) {
        const payload = {
          party_type: partyType,
          party_id: partyId,
          org_id: orgId,
          scheme: r.scheme,
          registration_number: r.registration_number.trim(),
          tax_region_id: r.tax_region_id || null,
          is_primary: !!r.is_primary,
        };
        if (r.id) {
          await viewAPI.update(MODEL, r.id, VIEW, payload);
        } else {
          await viewAPI.create(MODEL, VIEW, payload);
        }
      }
      toast({
        title: 'Saved',
        description: `${taxPack.registrationLabel} registration(s) saved`,
      });
      await load();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e?.message || 'Failed to save registrations',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Tax registrations</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {taxPack.registrationLabel}
            {schemeOptions.length > 1 ? ' and related IDs' : ''} for this{' '}
            {partyType === 'entity'
              ? 'legal entity'
              : partyType === 'supplier'
                ? 'supplier'
                : 'customer'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-primary hover:bg-primary/90"
            disabled={isSaving}
            onClick={handleSave}
          >
            {isSaving ? 'Saving…' : 'Save registrations'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No tax registrations yet. Click Add to enter a {taxPack.registrationLabel}.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Scheme</TableHead>
                <TableHead>{taxPack.registrationLabel} / Number</TableHead>
                <TableHead className="w-[220px]">Tax region</TableHead>
                <TableHead className="w-[90px]">Primary</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <Select
                      value={row.scheme}
                      onValueChange={(v) => updateRow(row.key, { scheme: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Scheme" />
                      </SelectTrigger>
                      <SelectContent>
                        {schemeOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s === 'GSTIN'
                              ? 'GSTIN'
                              : s === 'GST_HST_BN'
                                ? 'GST/HST BN'
                                : s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.registration_number}
                      placeholder={
                        row.scheme === 'GSTIN'
                          ? 'e.g. 33AAAAA0000A1Z5'
                          : `Enter ${taxPack.registrationLabel.toLowerCase()}`
                      }
                      onChange={(e) =>
                        updateRow(row.key, { registration_number: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <SearchDropDown
                      instanceType="tax_region"
                      instanceSourceKey="tax_region_id"
                      instanceKey="id"
                      instanceLabel="name"
                      instanceValue={row.tax_region}
                      onSelectItem={(_sk, key, value) => {
                        updateRow(row.key, {
                          tax_region_id: value?.[key] || null,
                          tax_region: value?.item || { id: value?.[key] },
                        });
                      }}
                      onClear={() =>
                        updateRow(row.key, { tax_region_id: null, tax_region: null })
                      }
                      limit="20"
                      searchParams="name"
                      type={MODEL}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.is_primary}
                      onCheckedChange={(c) => handlePrimary(row.key, c === true)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(row)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
