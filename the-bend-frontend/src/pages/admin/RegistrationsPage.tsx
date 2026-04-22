import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { adminApi } from '@/services/adminApi';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Eye, CheckCircle, XCircle, Loader2 } from 'lucide-react';

type RegistrationStatus = 'pending' | 'approved' | 'rejected';

interface Registration {
  id: string;
  name: string;
  business_type: string;
  admin_name: string;
  admin_email: string;
  phone?: string;
  address?: string;
  description?: string;
  created_at: string;
  status: RegistrationStatus;
  rejection_reason?: string;
}

const PRIMARY = 'hsl(160, 25%, 24%)';

const statusBadge = (status: RegistrationStatus) => {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
          Pending
        </Badge>
      );
    case 'approved':
      return (
        <Badge variant="outline" className="text-[hsl(160,25%,24%)] border-[hsl(35,18%,84%)] bg-[hsl(35,15%,94%)]">
          Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
          Rejected
        </Badge>
      );
  }
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export default function RegistrationsPage() {
  const [tab, setTab] = useState<RegistrationStatus>('pending');
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [counts, setCounts] = useState<{ pending: number; approved: number; rejected: number }>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // View dialog
  const [viewReg, setViewReg] = useState<Registration | null>(null);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<Registration | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  const fetchRegistrations = useCallback(async (status: RegistrationStatus) => {
    setLoading(true);
    try {
      const res = await adminApi.getRegistrations({ status });
      setRegistrations(res.data?.items ?? res.data?.registrations ?? res.data ?? []);
      if (res.data?.counts) setCounts(res.data.counts);
    } catch {
      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegistrations(tab);
  }, [tab, fetchRegistrations]);

  const handleApprove = async (reg: Registration) => {
    setActionLoading(reg.id);
    try {
      await adminApi.approveRegistration(reg.id);
      fetchRegistrations(tab);
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  const openReject = (reg: Registration) => {
    setRejectTarget(reg);
    setRejectReason('');
    setRejectError('');
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setRejectError('Please provide a rejection reason.');
      return;
    }
    setActionLoading(rejectTarget.id);
    try {
      await adminApi.rejectRegistration(rejectTarget.id, rejectReason.trim());
      setRejectTarget(null);
      fetchRegistrations(tab);
    } catch {
      setRejectError('Failed to reject registration. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and manage business registration requests
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as RegistrationStatus)}>
          <TabsList className="mb-4">
            <TabsTrigger value="pending">Pending {counts.pending > 0 && <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 rounded-full">{counts.pending}</span>}</TabsTrigger>
            <TabsTrigger value="approved">Approved {counts.approved > 0 && <span className="ml-1 text-xs bg-[hsl(35,15%,90%)] text-[hsl(160,25%,24%)] px-1.5 rounded-full">{counts.approved}</span>}</TabsTrigger>
            <TabsTrigger value="rejected">Rejected {counts.rejected > 0 && <span className="ml-1 text-xs bg-red-100 text-red-600 px-1.5 rounded-full">{counts.rejected}</span>}</TabsTrigger>
          </TabsList>

          {(['pending', 'approved', 'rejected'] as RegistrationStatus[]).map((status) => (
            <TabsContent key={status} value={status}>
              {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                  <Loader2 size={18} className="animate-spin" />
                  Loading...
                </div>
              ) : registrations.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  No {status} registrations found.
                </div>
              ) : (
                <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/60">
                        <TableHead className="pl-4">Business Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right pr-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registrations.map((reg) => (
                        <TableRow key={reg.id}>
                          <TableCell className="pl-4 font-medium">{reg.name}</TableCell>
                          <TableCell className="capitalize text-sm text-muted-foreground">
                            {reg.business_type}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {reg.admin_name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(reg.created_at)}
                          </TableCell>
                          <TableCell>{statusBadge(reg.status)}</TableCell>
                          <TableCell className="text-right pr-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setViewReg(reg)}
                                className="gap-1.5"
                              >
                                <Eye size={14} />
                                View
                              </Button>
                              {status === 'pending' && (
                                <>
                                  <Button
                                    size="sm"
                                    className="gap-1.5 text-white"
                                    style={{ backgroundColor: PRIMARY }}
                                    onClick={() => handleApprove(reg)}
                                    disabled={actionLoading === reg.id}
                                  >
                                    {actionLoading === reg.id ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <CheckCircle size={14} />
                                    )}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="gap-1.5"
                                    onClick={() => openReject(reg)}
                                    disabled={actionLoading === reg.id}
                                  >
                                    <XCircle size={14} />
                                    Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewReg} onOpenChange={() => setViewReg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewReg?.name}</DialogTitle>
            <DialogDescription>Registration details</DialogDescription>
          </DialogHeader>
          {viewReg && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Business Type
                  </p>
                  <p className="font-medium capitalize">{viewReg.business_type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Status
                  </p>
                  {statusBadge(viewReg.status)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Admin Name
                  </p>
                  <p className="font-medium">{viewReg.admin_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Email
                  </p>
                  <p className="font-medium">{viewReg.admin_email}</p>
                </div>
                {viewReg.phone && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                      Phone
                    </p>
                    <p className="font-medium">{viewReg.phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Submitted
                  </p>
                  <p className="font-medium">{formatDate(viewReg.created_at)}</p>
                </div>
              </div>
              {viewReg.address && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Address
                  </p>
                  <p className="font-medium">{viewReg.address}</p>
                </div>
              )}
              {viewReg.description && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Description
                  </p>
                  <p className="text-muted-foreground leading-relaxed">{viewReg.description}</p>
                </div>
              )}
              {viewReg.rejection_reason && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-xs text-red-600 uppercase tracking-wide mb-0.5 font-medium">
                    Rejection Reason
                  </p>
                  <p className="text-red-700">{viewReg.rejection_reason}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewReg(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Registration</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting{' '}
              <span className="font-semibold text-foreground">{rejectTarget?.name}</span>. This will
              be communicated to the applicant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              placeholder="e.g. Incomplete information, outside community area..."
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                setRejectError('');
              }}
              rows={4}
            />
            {rejectError && <p className="text-xs text-red-500">{rejectError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!!actionLoading}
            >
              {actionLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Rejecting...
                </span>
              ) : (
                'Confirm Rejection'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
