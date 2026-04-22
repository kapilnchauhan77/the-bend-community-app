import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, FileText, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useTenant } from '@/context/TenantContext';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

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
  const tenant = useTenant();
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
    defaultValues: { guidelines_accepted: false },
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
      <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-[hsl(40,25%,97%)]">
        <div className="w-full max-w-md text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
            style={{ backgroundColor: 'hsl(35, 15%, 90%)' }}
          >
            <CheckCircle2 className="w-8 h-8" style={{ color: PRIMARY }} strokeWidth={2} />
          </div>
          <h2 className="font-serif text-2xl font-bold text-[hsl(30,15%,18%)] mb-3">Thank You!</h2>
          <p className="text-sm text-[hsl(30,10%,48%)] leading-relaxed mb-8">
            Your registration has been submitted for review. The community admin will review
            your application and you'll receive an email once approved.
          </p>
          <Link to="/">
            <Button
              className="font-semibold text-sm tracking-wider uppercase text-white cursor-pointer"
              style={{ backgroundColor: PRIMARY }}
            >
              <ArrowLeft size={16} className="mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — Heritage image panel */}
      <div className="hidden lg:flex lg:w-5/12 relative overflow-hidden" style={{ backgroundColor: PRIMARY }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/courthouse.jpg')" }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, hsl(30,12%,12%,0.75), hsl(30,12%,12%,0.88))' }} />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          {/* Top — Logo */}
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-white/30 flex items-center justify-center">
              <span className="text-sm font-bold font-serif">B</span>
            </div>
            <div className="leading-none">
              <span className="text-base font-semibold font-serif tracking-wide block">THE BEND</span>
              <span className="text-[9px] tracking-[0.3em] uppercase text-white/60">Community</span>
            </div>
          </Link>

          {/* Bottom — Benefits */}
          <div>
            <div className="w-10 h-[2px] mb-5" style={{ backgroundColor: 'hsl(35,45%,55%)' }} />
            <h2 className="font-serif text-xl font-bold text-white/95 mb-4">Why join The Bend?</h2>
            <ul className="space-y-3">
              {[
                'Find gigs, materials & equipment with neighbors',
                'Reduce waste and save costs together',
                'Connect with the local business community',
                'List your needs and find help fast',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-white/75">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: 'hsl(35,45%,55%)' }} />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-white/40 mt-6 tracking-wider uppercase">Free to join · Admin-approved</p>
          </div>
        </div>
      </div>

      {/* Right — Registration form */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-9 h-9 border-2 flex items-center justify-center" style={{ borderColor: BRONZE }}>
                <span className="text-sm font-bold font-serif" style={{ color: BRONZE }}>B</span>
              </div>
              <div className="leading-none">
                <span className="text-[15px] font-semibold font-serif text-[hsl(30,15%,18%)] tracking-wide block">THE BEND</span>
                <span className="text-[9px] tracking-[0.3em] uppercase text-[hsl(30,10%,48%)]">Community</span>
              </div>
            </Link>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="font-serif text-2xl font-bold text-[hsl(30,15%,18%)] mb-1">Register Your Business</h1>
            <p className="text-sm text-[hsl(30,10%,48%)]">Join the community and start sharing resources with your neighbors</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            {submitError && (
              <div
                className="p-3.5 rounded text-sm leading-relaxed"
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

            {/* Section: Business Info */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(35,45%,42%)] mb-4">
                Business Information
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="shop_name" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                    Business Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="shop_name"
                    placeholder="e.g. Corner Bakehouse"
                    {...register('shop_name')}
                    className={`h-11 border-[hsl(35,18%,84%)] bg-white ${errors.shop_name ? 'border-red-400' : ''}`}
                  />
                  <FieldError message={errors.shop_name?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="business_type" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                    Business Type <span className="text-red-500">*</span>
                  </Label>
                  <Controller
                    name="business_type"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="business_type" className={`h-11 border-[hsl(35,18%,84%)] bg-white ${errors.business_type ? 'border-red-400' : ''}`}>
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

                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                    Address <span className="font-normal normal-case tracking-normal text-[hsl(30,10%,55%)]">(optional)</span>
                  </Label>
                  <Input
                    id="address"
                    placeholder="123 High Street, Montross"
                    {...register('address')}
                    className="h-11 border-[hsl(35,18%,84%)] bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-[hsl(35,18%,84%)]" />

            {/* Section: Owner Info */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(35,45%,42%)] mb-4">
                Owner Details
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="owner_name" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                    Your Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="owner_name"
                    placeholder="Jane Smith"
                    {...register('owner_name')}
                    className={`h-11 border-[hsl(35,18%,84%)] bg-white ${errors.owner_name ? 'border-red-400' : ''}`}
                  />
                  <FieldError message={errors.owner_name?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                    Email Address <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="jane@yourbusiness.com"
                    {...register('email')}
                    className={`h-11 border-[hsl(35,18%,84%)] bg-white ${errors.email ? 'border-red-400' : ''}`}
                  />
                  <FieldError message={errors.email?.message} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                      Phone <span className="font-normal normal-case tracking-normal text-[hsl(30,10%,55%)]">(optional)</span>
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 555 0100"
                      {...register('phone')}
                      className={`h-11 border-[hsl(35,18%,84%)] bg-white ${errors.phone ? 'border-red-400' : ''}`}
                    />
                    <FieldError message={errors.phone?.message} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="whatsapp" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                      WhatsApp <span className="font-normal normal-case tracking-normal text-[hsl(30,10%,55%)]">(opt.)</span>
                    </Label>
                    <Input
                      id="whatsapp"
                      type="tel"
                      placeholder="+1 555 0100"
                      {...register('whatsapp')}
                      className="h-11 border-[hsl(35,18%,84%)] bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-[hsl(35,18%,84%)]" />

            {/* Section: Password */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(35,45%,42%)] mb-4">
                Create Password
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                    Password <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Min. 8 characters"
                      {...register('password')}
                      className={`h-11 pr-10 border-[hsl(35,18%,84%)] bg-white ${errors.password ? 'border-red-400' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(30,10%,55%)] hover:text-[hsl(30,15%,25%)] transition-colors cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <FieldError message={errors.password?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm_password" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                    Confirm Password <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm_password"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repeat your password"
                      {...register('confirm_password')}
                      className={`h-11 pr-10 border-[hsl(35,18%,84%)] bg-white ${errors.confirm_password ? 'border-red-400' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(30,10%,55%)] hover:text-[hsl(30,15%,25%)] transition-colors cursor-pointer"
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
            <div className="h-px bg-[hsl(35,18%,84%)]" />

            {/* Community Guidelines */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(35,45%,42%)] mb-4">
                Community Guidelines
              </p>

              <div
                className="guidelines-card rounded p-4 mb-4 flex items-center gap-4 bg-[hsl(35,15%,93%)] border border-[hsl(35,18%,84%)]"
              >
                <div
                  className="guidelines-icon flex-shrink-0 flex items-center justify-center w-10 h-10 rounded bg-[hsl(160,25%,24%,0.12)]"
                >
                  <FileText className="w-5 h-5" style={{ color: PRIMARY }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[hsl(30,15%,18%)]">The Bend Community Guidelines</p>
                  <p className="text-xs text-[hsl(30,10%,48%)] mt-0.5">Rules for respectful resource sharing</p>
                </div>
                <a
                  href="/guidelines"
                  className="flex-shrink-0 text-xs font-semibold hover:underline"
                  style={{ color: BRONZE }}
                >
                  View
                </a>
              </div>

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
                    />
                    <label htmlFor="guidelines_accepted" className="text-sm leading-relaxed cursor-pointer select-none text-[hsl(30,15%,25%)]">
                      I have read and agree to the{' '}
                      <a href="/guidelines" className="font-semibold hover:underline" style={{ color: BRONZE }}>
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
              className="w-full h-11 font-semibold text-sm tracking-wider uppercase text-white transition-all duration-150 active:scale-[0.98] cursor-pointer"
              style={{
                backgroundColor: isSubmitting ? 'hsl(160, 25%, 18%)' : PRIMARY,
                boxShadow: isSubmitting ? 'none' : '0 2px 8px hsl(160, 25%, 24%, 0.3)',
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </span>
              ) : (
                'Submit Registration'
              )}
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[hsl(35,18%,84%)]" />
              <span className="text-[10px] text-[hsl(30,10%,60%)] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-[hsl(35,18%,84%)]" />
            </div>

            <p className="text-center text-sm text-[hsl(30,10%,48%)]">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold hover:underline" style={{ color: BRONZE }}>
                Log in
              </Link>
            </p>
          </form>

          <p className="text-center text-[10px] text-[hsl(30,10%,60%)] mt-8 tracking-wide">
            &copy; 2026 The Bend Community
          </p>
        </div>
      </div>
    </div>
  );
}
