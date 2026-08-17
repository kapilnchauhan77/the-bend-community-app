export function getInitialIOSBannerState({
  userAgent,
  standalone,
  dismissed,
}: {
  userAgent: string;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  const ios = /iPad|iPhone|iPod/.test(userAgent);
  const mobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(userAgent);
  return ios && mobile && !standalone && !dismissed;
}

export function getInitialAdvertiseStep(
  sessionId: string | null,
): 'select' | 'success' {
  return sessionId ? 'success' : 'select';
}
