
import * as z from 'zod';

export const locationSchema = z.object({
  name: z.string().min(1, { message: 'Location name is required' }),
  address: z.string().optional(),
  city: z.string().min(1, { message: 'City is required' }),
  state: z.string().min(1, { message: 'State is required' }),
  postal_code: z.string().min(1, { message: 'Postal code is required' }),
  country: z.string().min(1, { message: 'Country is required' }),
  org_id: z.string().min(1, { message: 'Organization is required' }),
  department_id: z.string().optional(),
});

export type LocationFormValues = z.infer<typeof locationSchema>;
