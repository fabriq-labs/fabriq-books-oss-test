import React, { useState } from 'react';
import { viewAPI } from '@/api/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const SUPPLIER_VIEW = 'supplier_view';
const CUSTOMERS_VIEW = 'customers_view';

type FieldErrors = Record<string, string>;

function required(value: string, label: string): string | null {
  if (!String(value || '').trim()) return `${label} is required`;
  return null;
}

function emailOk(value: string): string | null {
  const v = String(value || '').trim();
  if (!v) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email';
  return null;
}

export type QuickSupplierCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (supplier: Record<string, unknown>) => void | Promise<void>;
};

export function QuickSupplierCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickSupplierCreateDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState({
    supplier_name: '',
    legal_name: '',
    supplier_address: '',
    city: '',
    state: '',
    country: '',
    zip_code: '',
    primary_phone: '',
    primary_email: '',
  });

  const reset = () => {
    setForm({
      supplier_name: '',
      legal_name: '',
      supplier_address: '',
      city: '',
      state: '',
      country: '',
      zip_code: '',
      primary_phone: '',
      primary_email: '',
    });
    setErrors({});
    setSaving(false);
  };

  const setField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    const checks: Array<[keyof typeof form, string]> = [
      ['supplier_name', 'Supplier name'],
      ['supplier_address', 'Address'],
      ['city', 'City'],
      ['state', 'State'],
      ['country', 'Country'],
      ['zip_code', 'Zip / postal code'],
      ['primary_phone', 'Phone'],
    ];
    for (const [key, label] of checks) {
      const err = required(form[key], label);
      if (err) next[key] = err;
    }
    const emailErr = emailOk(form.primary_email);
    if (emailErr) next.primary_email = emailErr;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleDone = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const name = form.supplier_name.trim();
      const payload = {
        supplier_name: name,
        legal_name: form.legal_name.trim() || name,
        supplier_address: form.supplier_address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim(),
        zip_code: form.zip_code.trim(),
        primary_phone: form.primary_phone.trim(),
        primary_email: form.primary_email.trim(),
        onboarded_date: new Date().toISOString(),
        status: 'Active',
      };
      const res = (await viewAPI.create('supplier', SUPPLIER_VIEW, payload)) as {
        data?: Record<string, unknown>;
      };
      const created = res?.data;
      if (!created?.id) {
        throw new Error('Supplier was created but no id was returned');
      }
      toast({ title: 'Supplier created', description: String(created.supplier_name || name) });
      onOpenChange(false);
      reset();
      await onCreated(created);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create supplier';
      toast({ title: 'Could not create supplier', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add new supplier</DialogTitle>
          <DialogDescription>
            Create a supplier with the required details, then select it on this bill.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {(
            [
              ['supplier_name', 'Supplier name', true],
              ['legal_name', 'Legal name', false],
              ['supplier_address', 'Address', true],
              ['city', 'City', true],
              ['state', 'State / province', true],
              ['country', 'Country', true],
              ['zip_code', 'Zip / postal code', true],
              ['primary_phone', 'Phone', true],
              ['primary_email', 'Email', true],
            ] as const
          ).map(([key, label, isRequired]) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`quick-supplier-${key}`}>
                {label}
                {isRequired ? <span className="text-destructive"> *</span> : null}
              </Label>
              <Input
                id={`quick-supplier-${key}`}
                value={form[key]}
                onChange={(e) => setField(key, e.target.value)}
                autoComplete="off"
              />
              {errors[key] ? (
                <p className="text-xs text-destructive">{errors[key]}</p>
              ) : null}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleDone()}>
            {saving ? 'Saving…' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type QuickCustomerCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: Record<string, unknown>) => void | Promise<void>;
};

export function QuickCustomerCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickCustomerCreateDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState({
    customer_name: '',
    customer_address: '',
    city: '',
    state: '',
    country: '',
    zip_code: '',
    primary_phone: '',
    primary_email: '',
    industry: '',
  });

  const reset = () => {
    setForm({
      customer_name: '',
      customer_address: '',
      city: '',
      state: '',
      country: '',
      zip_code: '',
      primary_phone: '',
      primary_email: '',
      industry: '',
    });
    setErrors({});
    setSaving(false);
  };

  const setField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    const checks: Array<[keyof typeof form, string]> = [
      ['customer_name', 'Customer name'],
      ['customer_address', 'Address'],
      ['city', 'City'],
      ['state', 'State'],
      ['country', 'Country'],
      ['zip_code', 'Zip / postal code'],
      ['industry', 'Industry'],
    ];
    for (const [key, label] of checks) {
      const err = required(form[key], label);
      if (err) next[key] = err;
    }
    const emailErr = emailOk(form.primary_email);
    if (emailErr) next.primary_email = emailErr;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleDone = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        customer_name: form.customer_name.trim(),
        customer_address: form.customer_address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim(),
        zip_code: form.zip_code.trim(),
        primary_phone: form.primary_phone.trim() || null,
        primary_email: form.primary_email.trim(),
        industry: form.industry.trim(),
      };
      const res = (await viewAPI.create('customers', CUSTOMERS_VIEW, payload)) as {
        data?: Record<string, unknown>;
      };
      const created = res?.data;
      if (!created?.id) {
        throw new Error('Customer was created but no id was returned');
      }
      toast({
        title: 'Customer created',
        description: String(created.customer_name || form.customer_name),
      });
      onOpenChange(false);
      reset();
      await onCreated(created);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create customer';
      toast({ title: 'Could not create customer', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add new customer</DialogTitle>
          <DialogDescription>
            Create a customer with the required details, then select it on this invoice.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {(
            [
              ['customer_name', 'Customer name', true],
              ['customer_address', 'Address', true],
              ['city', 'City', true],
              ['state', 'State / province', true],
              ['country', 'Country', true],
              ['zip_code', 'Zip / postal code', true],
              ['industry', 'Industry', true],
              ['primary_email', 'Email', true],
              ['primary_phone', 'Phone', false],
            ] as const
          ).map(([key, label, isRequired]) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`quick-customer-${key}`}>
                {label}
                {isRequired ? <span className="text-destructive"> *</span> : null}
              </Label>
              <Input
                id={`quick-customer-${key}`}
                value={form[key]}
                onChange={(e) => setField(key, e.target.value)}
                autoComplete="off"
              />
              {errors[key] ? (
                <p className="text-xs text-destructive">{errors[key]}</p>
              ) : null}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleDone()}>
            {saving ? 'Saving…' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
