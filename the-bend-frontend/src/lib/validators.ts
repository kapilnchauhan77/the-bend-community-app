import { z } from 'zod';

export const registerSchema = z
  .object({
    shop_name: z.string().min(2, 'Shop name must be at least 2 characters').max(150),
    business_type: z.string().min(1, 'Please select a business type'),
    owner_name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email address'),
    phone: z.string().max(20).optional().or(z.literal('')),
    whatsapp: z.string().max(20).optional().or(z.literal('')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter'),
    confirm_password: z.string(),
    address: z.string().optional().or(z.literal('')),
    guidelines_accepted: z.boolean().refine((val) => val === true, {
      message: 'You must accept the community guidelines',
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
