import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/services/authApi';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword) {
      setError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token!, newPassword);
      setSuccess(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      const detail = axiosErr?.response?.data?.error?.message;
      setError(detail || 'Something went wrong. Please try again or request a new reset link.');
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

        {/* No token */}
        {!token ? (
          <div className="text-center">
            <div
              className="p-4 rounded text-sm leading-relaxed mb-6"
              style={{
                backgroundColor: 'hsl(0, 86%, 97%)',
                border: '1px solid hsl(0, 86%, 90%)',
                color: 'hsl(0, 72%, 42%)',
              }}
              role="alert"
            >
              Invalid or missing reset token. Please request a new password reset link.
            </div>
            <Link
              to="/forgot-password"
              className="text-sm font-medium hover:underline transition-colors"
              style={{ color: BRONZE }}
            >
              Request Reset Link
            </Link>
          </div>
        ) : success ? (
          /* Success state */
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle size={48} style={{ color: PRIMARY }} />
            </div>
            <h1 className="font-serif text-2xl font-bold text-[hsl(30,15%,18%)] mb-2">
              Password reset successfully!
            </h1>
            <p className="text-sm text-[hsl(30,10%,48%)] mb-6 leading-relaxed">
              Your password has been updated. You can now sign in with your new password.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center h-11 px-6 font-semibold text-sm tracking-wider uppercase text-white rounded transition-all duration-150 active:scale-[0.98]"
              style={{
                backgroundColor: PRIMARY,
                boxShadow: `0 2px 8px hsl(160, 25%, 24%, 0.3)`,
              }}
            >
              Sign In
            </Link>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="mb-8 text-center">
              <h1 className="font-serif text-2xl font-bold text-[hsl(30,15%,18%)] mb-1">
                Reset Password
              </h1>
              <p className="text-sm text-[hsl(30,10%,48%)]">
                Enter your new password below
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

              {/* New Password */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="new-password"
                  className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]"
                >
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-11 pr-10 border-[hsl(35,18%,84%)] bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(30,10%,55%)] hover:text-[hsl(30,15%,25%)] transition-colors cursor-pointer"
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="confirm-password"
                  className="text-xs font-semibold uppercase tracking-wider text-[hsl(30,10%,40%)]"
                >
                  Confirm Password
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Repeat your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 pr-10 border-[hsl(35,18%,84%)] bg-white"
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
                    Resetting...
                  </span>
                ) : (
                  'Reset Password'
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
