import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle, DollarSign, Tag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageLayout } from '@/components/layout/PageLayout';
import { listingApi } from '@/services/listingApi';

const schema = z
  .object({
    type: z.enum(['offer', 'request']),
    category: z.enum(['staff', 'materials', 'equipment']),
    title: z.string().min(5, 'Title must be at least 5 characters').max(100, 'Title must be under 100 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters').max(500, 'Description must be under 500 characters'),
    quantity: z.string().optional(),
    unit: z.string().optional(),
    urgency: z.enum(['normal', 'urgent', 'critical']),
    is_free: z.boolean(),
    price: z.string().optional(),
    expiry_date: z.string().optional(),
  })
  .refine(
    (data) => data.is_free || (data.price && parseFloat(data.price) > 0),
    { message: 'Enter a price or mark as free', path: ['price'] }
  );

type FormData = z.infer<typeof schema>;

const urgencyOptions = [
  { value: 'normal', label: 'Normal', desc: 'No rush', color: 'border-gray-300 text-gray-700 bg-white' },
  { value: 'urgent', label: 'Urgent', desc: 'Needed soon', color: 'border-amber-400 text-amber-700 bg-amber-50' },
  { value: 'critical', label: 'Critical', desc: 'Needed ASAP', color: 'border-red-400 text-red-600 bg-red-50' },
] as const;

export default function CreateListingPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'offer',
      category: 'materials',
      urgency: 'normal',
      is_free: true,
    },
  });

  const watchedType = watch('type');
  const watchedUrgency = watch('urgency');
  const watchedIsFree = watch('is_free');

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setServerError(null);
    try {
      const payload: Record<string, unknown> = {
        type: data.type,
        category: data.category,
        title: data.title,
        description: data.description,
        urgency: data.urgency,
        is_free: data.is_free,
      };
      if (data.quantity) payload.quantity = data.quantity;
      if (data.unit) payload.unit = data.unit;
      if (!data.is_free && data.price) payload.price = parseFloat(data.price);
      if (data.expiry_date) payload.expiry_date = data.expiry_date;

      await listingApi.create(payload);
      setSuccess(true);
      setTimeout(() => navigate('/browse'), 1500);
    } catch {
      setServerError('Failed to create listing. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <PageLayout>
        <div className="max-w-lg mx-auto px-4 py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold mb-2">Listing Posted!</h2>
          <p className="text-muted-foreground">Redirecting you to browse...</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">Post a Listing</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Offer / Request toggle */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">What are you doing?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {(['offer', 'request'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValue('type', t)}
                    className={`py-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                      watchedType === t
                        ? t === 'offer'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {t === 'offer' ? 'Offering Something' : 'Requesting Something'}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Category */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Category</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                defaultValue="materials"
                onValueChange={(v) => setValue('category', v as FormData['category'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff / Labour</SelectItem>
                  <SelectItem value="materials">Raw Materials</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Title */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label htmlFor="title" className="mb-1.5 block">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Extra sourdough loaves available today"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description" className="mb-1.5 block">
                  Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="Describe what you're offering or requesting, any relevant details..."
                  rows={4}
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quantity + Unit */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quantity (optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="quantity" className="mb-1.5 block text-sm">Amount</Label>
                  <Input id="quantity" placeholder="e.g. 10" {...register('quantity')} />
                </div>
                <div>
                  <Label htmlFor="unit" className="mb-1.5 block text-sm">Unit</Label>
                  <Input id="unit" placeholder="e.g. kg, boxes, hours" {...register('unit')} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Urgency */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Urgency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {urgencyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setValue('urgency', opt.value)}
                    className={`py-2.5 px-2 rounded-lg border-2 text-center transition-all ${
                      watchedUrgency === opt.value
                        ? opt.color + ' border-2'
                        : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="is_free" className="flex items-center gap-2 cursor-pointer">
                  <Tag size={16} className="text-green-600" />
                  <span>Offering for free</span>
                </Label>
                <Switch
                  id="is_free"
                  checked={watchedIsFree}
                  onCheckedChange={(v) => setValue('is_free', v)}
                />
              </div>
              {!watchedIsFree && (
                <div className="relative">
                  <DollarSign
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <Input
                    placeholder="0.00"
                    className="pl-8"
                    type="number"
                    min="0"
                    step="0.01"
                    {...register('price')}
                  />
                  {errors.price && (
                    <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expiry date */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Expiry Date (optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <Input type="date" {...register('expiry_date')} />
            </CardContent>
          </Card>

          {serverError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              {serverError}
            </div>
          )}

          <div className="flex gap-3 pb-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => navigate(-1)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 gap-2"
              disabled={submitting}
              style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Posting...
                </>
              ) : (
                'Post Listing'
              )}
            </Button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
