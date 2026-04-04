import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { adminAPI, type OnboardTenantPayload } from "@/api/api";
import { ArrowLeft, ArrowRight, Plus, Trash2, Building2, Users } from "lucide-react";

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  password: string;
}

const initialUserRow = (): AdminUserRow => ({
  id: crypto.randomUUID(),
  email: "",
  name: "",
  password: "",
});

export default function TenantOnboardingPage() {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([initialUserRow()]);
  const [submitting, setSubmitting] = useState(false);

  const slugFromName = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

  const handleNameChange = (value: string) => {
    setTenantName(value);
    if (!tenantSlug || tenantSlug === slugFromName(tenantName)) {
      setTenantSlug(slugFromName(value));
    }
  };

  const addAdminUser = () => setAdminUsers((prev) => [...prev, initialUserRow()]);
  const removeAdminUser = (id: string) => {
    if (adminUsers.length <= 1) return;
    setAdminUsers((prev) => prev.filter((u) => u.id !== id));
  };
  const updateAdminUser = (id: string, field: keyof AdminUserRow, value: string) => {
    setAdminUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, [field]: value } : u))
    );
  };

  const step1Valid = tenantName.trim() && tenantSlug.trim();
  const step2Valid =
    adminUsers.every((u) => u.email.trim() && u.password) &&
    adminUsers.length >= 1;

  const handleSubmit = async () => {
    if (!step1Valid || !step2Valid) return;
    setSubmitting(true);
    try {
      const payload: OnboardTenantPayload = {
        tenant: {
          name: tenantName.trim(),
          slug: tenantSlug.trim().toLowerCase().replace(/\s+/g, "-"),
        },
        adminUsers: adminUsers.map((u) => ({
          email: u.email.trim(),
          name: u.name.trim() || undefined,
          password: u.password,
        })),
      };
      await adminAPI.onboardTenant(payload);
      toast({
        title: "Tenant created",
        description: `Tenant "${tenantName}" is ready. Admin users can log in and complete organization setup.`,
      });
      setStep(0);
      setTenantName("");
      setTenantSlug("");
      setAdminUsers([initialUserRow()]);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create tenant",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tenant Onboarding</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create a new tenant and admin users. They can log in and set up organizations and the rest.
        </p>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <button
          type="button"
          onClick={() => setStep(0)}
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
            step === 0 ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Tenant
        </button>
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
            step === 1 ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          <Users className="h-4 w-4" />
          Admin users
        </button>
      </div>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tenant details</CardTitle>
            <CardDescription>Name and slug for the new tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Name</Label>
              <Input
                id="tenant-name"
                value={tenantName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">Slug</Label>
              <Input
                id="tenant-slug"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="acme-corp"
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier; must be unique.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(1)} disabled={!step1Valid}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Admin users</CardTitle>
            <CardDescription>
              At least one admin (Admin role). They will manage the tenant after login.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {adminUsers.map((u) => (
              <div key={u.id} className="flex flex-wrap gap-3 items-end p-3 border rounded-lg">
                <div className="flex-1 min-w-[180px] space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={u.email}
                    onChange={(e) => updateAdminUser(u.id, "email", e.target.value)}
                    placeholder="admin@example.com"
                  />
                </div>
                <div className="flex-1 min-w-[140px] space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={u.name}
                    onChange={(e) => updateAdminUser(u.id, "name", e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="flex-1 min-w-[140px] space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={u.password}
                    onChange={(e) => updateAdminUser(u.id, "password", e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeAdminUser(u.id)}
                  disabled={adminUsers.length <= 1}
                  title="Remove user"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addAdminUser} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Add another admin
            </Button>
            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!step2Valid || submitting}
              >
                {submitting ? "Creating…" : "Create tenant"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
