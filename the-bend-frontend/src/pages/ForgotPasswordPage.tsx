import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/services/authApi';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSuccess(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      const detail = axiosErr?.response?.data?.error?.message;
      setError(detail || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-[hsl(40,25%,97%)]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link to="/" className="flex items-center gap-3">
            <div
              className="w-9 h-9 border-2 flex items-center justify-center"
              style={{ borderColor: BRONZE }}
            >
              <span className="text-sm font-bold font-serif" style={{ color: BRONZE }}>
                B
              </span>
            </div>
            <div className="leading-none">
              <span className="text-[15px] font-semibold font-serif text-[hsl(30,15%,18%)] tracking-wide block">
                THE BEND
              </span>
              <span className="text-[9px] tracking-[0.3em] uppercase text-[hsl(30,10%,48%)]">
                Community
              </span>
            </div>
          </Link>
        </div>

        {success ? (
          /* Success state */
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle size={48} style={{ color: PRIMARY }} />
            </div>
            <h1 className="font-serif text-2xl font-bold text-[hsl(30,15%,18%)] mb-2">
              Check your email
            </h1>
            <p className="text-sm text-[hsl(30,10%,48%)] mb-4 leading-relaxed">
              If an account exists for <strong>{email}</strong>, we've sent a password reset link.
              Check your inbox and spam folder.
            </p>
            <p className="text-xs text-[hsl(30,10%,55%)] mb-6 leading-relaxed">
              Don't have an account?{' '}
              <Link to="/register" className="font-semibold hover:underline" style={{ color: BRONZE }}>
                Register your business
              </Link>{' '}
              to get started.
            </p>
            <Link
              to="/login"
              className="text-sm font-medium hover:underline transition-colors"
              style={{ color: BRONZE }}
            >
              Back to Login
            </Link>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="mb-8 text-center">
              <h1 className="font-serif text-2xl font-bold text-[hsl(30,15%,18%)] mb-1">
                Forgot Password
              </h1>
              <p className="text-sm text-[hsl(30,10%,48%)]">
                Enter your email and we'll send you a reset link
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                <Label
                  htmlFor="email"
                  className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 border-[hsl(35,18%,84%)] bg-white"
                />
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
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </Button>
            </form>

            <div className="text-center mt-6">
              <Link
                to="/login"
                className="text-sm font-medium hover:underline transition-colors"
                style={{ color: BRONZE }}
              >
                Back to Login
              </Link>
            </div>
          </>
        )}

        <p className="text-center text-[10px] text-[hsl(30,10%,60%)] mt-10 tracking-wide">
          &copy; {new Date().getFullYear()} Community Platform
        </p>
      </div>
    </div>
  );
}
