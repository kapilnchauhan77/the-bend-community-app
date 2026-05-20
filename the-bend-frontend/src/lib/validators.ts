import { z } from 'zod';

export const registerSchema = z
  .object({
    user_type: z.enum(['business', 'individual']).default('business'),
    shop_name: z.string().max(150).optional().or(z.literal('')),
    business_type: z.string().optional().or(z.literal('')),
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
  .superRefine((data, ctx) => {
    if (data.password !== data.confirm_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirm_password'],
      });
    }
    if (data.user_type === 'business') {
      if (!data.shop_name || data.shop_name.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Shop name must be at least 2 characters',
          path: ['shop_name'],
        });
      }
      if (!data.business_type || data.business_type.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please select a business type',
          path: ['business_type'],
        });
      }
    }
  });

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
