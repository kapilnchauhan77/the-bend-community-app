export function getInitialIOSBannerState({
  userAgent,
  standalone,
  dismissed,
  msStream = false,
}: {
  userAgent: string;
  standalone: boolean;
  dismissed: boolean;
  msStream?: boolean;
}): boolean {
  const ios = /iPad|iPhone|iPod/.test(userAgent);
  const mobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(userAgent);
  return ios && mobile && !msStream && !standalone && !dismissed;
}

export function getInitialAdvertiseStep(
  sessionId: string | null,
): 'select' | 'success' {
  return sessionId ? 'success' : 'select';
}
