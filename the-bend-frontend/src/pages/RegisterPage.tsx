import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Leaf, FileText, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { authApi } from '@/services/authApi';
import { registerSchema, type RegisterFormData } from '@/lib/validators';
import { BUSINESS_TYPES } from '@/lib/constants';

const PRIMARY = 'hsl(142, 76%, 36%)';
const PRIMARY_DARK = 'hsl(142, 76%, 29%)';

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  retail: 'Retail',
  service: 'Service',
  hardware: 'Hardware',
  deli: 'Deli',
  bakery: 'Bakery',
  other: 'Other',
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
}

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      guidelines_accepted: false,
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await authApi.register({
        shop_name: data.shop_name,
        business_type: data.business_type,
        owner_name: data.owner_name,
        email: data.email,
        phone: data.phone,
        whatsapp: data.whatsapp || undefined,
        password: data.password,
        address: data.address || undefined,
        guidelines_accepted: data.guidelines_accepted,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      const detail = axiosErr?.response?.data?.error?.message;
      setSubmitError(detail || 'Registration failed. Please check your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (submitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4 py-12"
        style={{ backgroundColor: 'hsl(140, 20%, 97%)' }}
      >
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 30% 30%, hsl(142, 76%, 36%, 0.06) 0%, transparent 50%)`,
          }}
        />
        <Card
          className="w-full max-w-md text-center"
          style={{
            border: '1px solid hsl(142, 30%, 88%)',
            boxShadow:
              '0 4px 6px -1px hsl(142, 76%, 36%, 0.08), 0 20px 40px -8px hsl(142, 76%, 36%, 0.12)',
          }}
        >
          <CardContent className="pt-10 pb-10 px-8">
            <div
              className="flex items-center justify-center w-16 h-16 rounded-full mx-auto mb-5"
              style={{ backgroundColor: 'hsl(142, 76%, 94%)' }}
            >
              <CheckCircle2 className="w-8 h-8" style={{ color: PRIMARY }} strokeWidth={2} />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">Thank You!</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-8">
              Your registration has been submitted for review. The community admin will review
              your application and you'll receive an email once approved.
            </p>
            <Link to="/">
              <Button
                className="font-semibold"
                style={{
                  backgroundColor: PRIMARY,
                  color: 'white',
                  boxShadow: `0 2px 8px hsl(142, 76%, 36%, 0.35)`,
                }}
              >
                <ArrowLeft size={16} className="mr-2" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: 'hsl(140, 20%, 97%)' }}
    >
      {/* Subtle background pattern */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 20%, hsl(142, 76%, 36%, 0.06) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, hsl(142, 76%, 36%, 0.04) 0%, transparent 50%)`,
        }}
      />

      <div className="w-full max-w-lg relative">
        <Card
          style={{
            border: '1px solid hsl(142, 30%, 88%)',
            boxShadow:
              '0 4px 6px -1px hsl(142, 76%, 36%, 0.08), 0 20px 40px -8px hsl(142, 76%, 36%, 0.12)',
          }}
        >
          <CardHeader className="text-center space-y-3 pb-6 pt-8">
            {/* Logo mark */}
            <div className="flex items-center justify-center mb-1">
              <div
                className="flex items-center justify-center w-12 h-12 rounded-2xl"
                style={{
                  backgroundColor: PRIMARY,
                  boxShadow: `0 4px 12px hsl(142, 76%, 36%, 0.4)`,
                }}
              >
                <Leaf className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
            </div>

            <div>
              <span className="text-2xl font-bold tracking-tight" style={{ color: PRIMARY }}>
                The Bend
              </span>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium tracking-widest uppercase">
                Community
              </p>
            </div>

            <div className="pt-1">
              <CardTitle className="text-xl font-semibold text-foreground">
                Join The Bend Community
              </CardTitle>
              <CardDescription className="mt-1 text-sm">
                Register your shop to connect with local businesses
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pb-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              {submitError && (
                <div
                  className="p-3.5 rounded-lg text-sm leading-relaxed"
                  style={{
                    backgroundColor: 'hsl(0, 86%, 97%)',
                    border: '1px solid hsl(0, 86%, 90%)',
                    color: 'hsl(0, 72%, 42%)',
                  }}
                  role="alert"
                >
                  {submitError}
                </div>
              )}

              {/* Section: Shop Info */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Shop Information
                </p>
                <div className="space-y-4">
                  {/* Shop Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="shop_name" className="text-sm font-medium">
                      Shop Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="shop_name"
                      placeholder="e.g. Corner Bakehouse"
                      {...register('shop_name')}
                      className={errors.shop_name ? 'border-red-400' : ''}
                    />
                    <FieldError message={errors.shop_name?.message} />
                  </div>

                  {/* Business Type */}
                  <div className="space-y-1.5">
                    <Label htmlFor="business_type" className="text-sm font-medium">
                      Business Type <span className="text-red-500">*</span>
                    </Label>
                    <Controller
                      name="business_type"
                      control={control}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger
                            id="business_type"
                            className={errors.business_type ? 'border-red-400' : ''}
                          >
                            <SelectValue placeholder="Select your business type" />
                          </SelectTrigger>
                          <SelectContent>
                            {BUSINESS_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {BUSINESS_TYPE_LABELS[type] ?? type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError message={errors.business_type?.message} />
                  </div>

                  {/* Address */}
                  <div className="space-y-1.5">
                    <Label htmlFor="address" className="text-sm font-medium">
                      Address{' '}
                      <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="address"
                      placeholder="123 High Street, The Bend"
                      {...register('address')}
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div
                className="border-t"
                style={{ borderColor: 'hsl(142, 30%, 90%)' }}
              />

              {/* Section: Owner Info */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Owner Details
                </p>
                <div className="space-y-4">
                  {/* Owner Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="owner_name" className="text-sm font-medium">
                      Your Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="owner_name"
                      placeholder="Jane Smith"
                      {...register('owner_name')}
                      className={errors.owner_name ? 'border-red-400' : ''}
                    />
                    <FieldError message={errors.owner_name?.message} />
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="jane@yourbusiness.com"
                      {...register('email')}
                      className={errors.email ? 'border-red-400' : ''}
                    />
                    <FieldError message={errors.email?.message} />
                  </div>

                  {/* Phone + WhatsApp row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-sm font-medium">
                        Phone <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+1 555 0100"
                        {...register('phone')}
                        className={errors.phone ? 'border-red-400' : ''}
                      />
                      <FieldError message={errors.phone?.message} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="whatsapp" className="text-sm font-medium">
                        WhatsApp{' '}
                        <span className="text-muted-foreground font-normal text-xs">(opt.)</span>
                      </Label>
                      <Input
                        id="whatsapp"
                        type="tel"
                        placeholder="+1 555 0100"
                        {...register('whatsapp')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div
                className="border-t"
                style={{ borderColor: 'hsl(142, 30%, 90%)' }}
              />

              {/* Section: Password */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Create Password
                </p>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Password <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Min. 8 characters, 1 letter & 1 number"
                        {...register('password')}
                        className={`pr-10 ${errors.password ? 'border-red-400' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <FieldError message={errors.password?.message} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm_password" className="text-sm font-medium">
                      Confirm Password <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirm_password"
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Repeat your password"
                        {...register('confirm_password')}
                        className={`pr-10 ${errors.confirm_password ? 'border-red-400' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      >
                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <FieldError message={errors.confirm_password?.message} />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div
                className="border-t"
                style={{ borderColor: 'hsl(142, 30%, 90%)' }}
              />

              {/* Community Guidelines */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Community Guidelines
                </p>

                {/* Guidelines card */}
                <div
                  className="rounded-lg p-4 mb-4 flex items-center gap-4"
                  style={{
                    backgroundColor: 'hsl(142, 40%, 95%)',
                    border: '1px solid hsl(142, 40%, 86%)',
                  }}
                >
                  <div
                    className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg"
                    style={{ backgroundColor: 'hsl(142, 76%, 36%, 0.15)' }}
                  >
                    <FileText className="w-5 h-5" style={{ color: PRIMARY }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      The Bend Community Guidelines
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Rules for respectful resource sharing in our community
                    </p>
                  </div>
                  <a
                    href="/guidelines.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors hover:underline"
                    style={{ color: PRIMARY }}
                  >
                    View / Download
                  </a>
                </div>

                {/* Checkbox */}
                <Controller
                  name="guidelines_accepted"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="guidelines_accepted"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="mt-0.5"
                        style={
                          field.value
                            ? ({ '--checkbox-bg': PRIMARY } as React.CSSProperties)
                            : undefined
                        }
                      />
                      <label
                        htmlFor="guidelines_accepted"
                        className="text-sm leading-relaxed cursor-pointer select-none"
                      >
                        I have read and agree to the{' '}
                        <a
                          href="/guidelines.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold hover:underline"
                          style={{ color: PRIMARY }}
                        >
                          community guidelines
                        </a>
                      </label>
                    </div>
                  )}
                />
                <FieldError message={errors.guidelines_accepted?.message} />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full font-semibold mt-1 transition-all duration-150 active:scale-[0.98]"
                style={{
                  backgroundColor: isSubmitting ? PRIMARY_DARK : PRIMARY,
                  color: 'white',
                  boxShadow: isSubmitting ? 'none' : `0 2px 8px hsl(142, 76%, 36%, 0.35)`,
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting registration...
                  </span>
                ) : (
                  'Submit Registration'
                )}
              </Button>

              {/* Login link */}
              <p className="text-center text-sm text-muted-foreground pt-1">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-semibold transition-colors hover:underline"
                  style={{ color: PRIMARY }}
                >
                  Log in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
