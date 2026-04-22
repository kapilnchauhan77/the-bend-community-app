import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/services/authApi';
import { loginSchema, type LoginFormData } from '@/lib/validators';
import { useTenant } from '@/context/TenantContext';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

export default function LoginPage() {
  const tenant = useTenant();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuthStore();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await authApi.login(data.email, data.password);
      const { access_token, refresh_token, user, shop } = response.data;
      setAuth(user, shop ?? null, access_token, refresh_token);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      const detail = axiosErr?.response?.data?.error?.message;
      if (detail?.toLowerCase().includes('pending')) {
        setError('Your business registration is pending approval. You will receive an email once approved.');
      } else if (detail?.toLowerCase().includes('suspended')) {
        setError('Your account has been suspended. Please contact the community admin for assistance.');
      } else {
        setError(detail || 'Invalid email or password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — Heritage image panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ backgroundColor: PRIMARY }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/the-bend-hero.jpg')" }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, hsl(30,12%,12%,0.82), hsl(30,12%,12%,0.55))' }} />
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

          {/* Bottom — Quote */}
          <div>
            <div className="w-10 h-[2px] mb-4" style={{ backgroundColor: 'hsl(35,45%,55%)' }} />
            <blockquote className="font-serif text-xl leading-relaxed text-white/90 max-w-sm">
              Connecting neighbors, preserving traditions, building together.
            </blockquote>
            <p className="text-xs text-white/50 mt-3 tracking-wider uppercase">Since the founding of Montross</p>
          </div>
        </div>
      </div>

      {/* Right — Login form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-[hsl(40,25%,97%)]">
        <div className="w-full max-w-sm">
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
            <h1 className="font-serif text-2xl font-bold text-[hsl(30,15%,18%)] mb-1">Welcome back</h1>
            <p className="text-sm text-[hsl(30,10%,48%)]">Sign in to your business account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Error */}
            {error && (
              <div
                className="p-3.5 rounded text-sm leading-relaxed"
                style={{
                  backgroundColor: 'hsl(0, 86%, 97%)',
                  border: '1px solid hsl(0, 86%, 90%)',
                  color: 'hsl(0, 72%, 42%)',
                }}
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email')}
                className={`h-11 border-[hsl(35,18%,84%)] bg-white ${errors.email ? 'border-red-400 focus-visible:ring-red-300' : ''}`}
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]">
                  Password
                </Label>
                <button
                  type="button"
                  className="text-xs font-medium transition-colors hover:underline cursor-pointer"
                  style={{ color: BRONZE }}
                  onClick={() => navigate('/forgot-password')}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password')}
                  className={`h-11 pr-10 border-[hsl(35,18%,84%)] bg-white ${errors.password ? 'border-red-400 focus-visible:ring-red-300' : ''}`}
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
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-11 font-semibold text-sm tracking-wider uppercase text-white transition-all duration-150 active:scale-[0.98] cursor-pointer"
              style={{
                backgroundColor: isSubmitting ? 'hsl(160, 25%, 18%)' : PRIMARY,
                boxShadow: isSubmitting ? 'none' : `0 2px 8px hsl(160, 25%, 24%, 0.3)`,
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Log In'
              )}
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 h-px bg-[hsl(35,18%,84%)]" />
              <span className="text-[10px] text-[hsl(30,10%,60%)] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-[hsl(35,18%,84%)]" />
            </div>

            {/* Register link */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 font-semibold text-sm tracking-wider uppercase border-[hsl(35,18%,84%)] text-[hsl(30,15%,30%)] hover:border-[hsl(35,45%,42%)] cursor-pointer"
              onClick={() => navigate('/register')}
            >
              Register Your Business
            </Button>
          </form>

          <p className="text-center text-[10px] text-[hsl(30,10%,60%)] mt-8 tracking-wide">
            &copy; 2026 The Bend Community
          </p>
        </div>
      </div>
    </div>
  );
}
