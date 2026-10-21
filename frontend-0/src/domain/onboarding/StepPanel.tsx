import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface StepPanelProps {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}

export function StepPanel({ title, description, children }: StepPanelProps) {
  return (
    <Card>
      <CardHeader className="p-5 sm:p-6">
        <CardTitle className="text-xl font-semibold text-gray-900">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">{children}</CardContent>
    </Card>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive leading-relaxed">
      {message}
    </p>
  );
}
