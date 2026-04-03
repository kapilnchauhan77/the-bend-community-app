import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/services/authApi';
import { loginSchema, type LoginFormData } from '@/lib/validators';

const PRIMARY = 'hsl(142, 76%, 36%)';
const PRIMARY_DARK = 'hsl(142, 76%, 29%)';

export default function LoginPage() {
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
        setError(
          'Your shop registration is pending approval. You will receive an email once approved.'
        );
      } else if (detail?.toLowerCase().includes('suspended')) {
        setError(
          'Your account has been suspended. Please contact the community admin for assistance.'
        );
      } else {
        setError(detail || 'Invalid email or password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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

      <Card
        className="w-full max-w-md relative"
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
              style={{ backgroundColor: PRIMARY, boxShadow: `0 4px 12px hsl(142, 76%, 36%, 0.4)` }}
            >
              <Leaf className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
          </div>

          {/* Brand name */}
          <div>
            <span
              className="text-2xl font-bold tracking-tight"
              style={{ color: PRIMARY }}
            >
              The Bend
            </span>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium tracking-widest uppercase">
              Community
            </p>
          </div>

          <div className="pt-1">
            <CardTitle className="text-xl font-semibold text-foreground">
              Welcome back
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              Sign in to your shop account
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pb-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Status alert */}
            {error && (
              <div
                className="p-3.5 rounded-lg text-sm leading-relaxed"
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
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email')}
                className={errors.email ? 'border-red-400 focus-visible:ring-red-300' : ''}
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <button
                  type="button"
                  className="text-xs font-medium transition-colors hover:underline"
                  style={{ color: PRIMARY }}
                  onClick={() => alert('Password reset coming soon. Please contact your admin.')}
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
                  className={`pr-10 ${errors.password ? 'border-red-400 focus-visible:ring-red-300' : ''}`}
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
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
              )}
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
                  Signing in...
                </span>
              ) : (
                'Log In'
              )}
            </Button>

            {/* Register link */}
            <p className="text-center text-sm text-muted-foreground pt-1">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-semibold transition-colors hover:underline"
                style={{ color: PRIMARY }}
              >
                Register your shop
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
