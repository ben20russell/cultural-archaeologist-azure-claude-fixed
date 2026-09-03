export async function getUserTelemetry(): Promise<{ device: string; location: string; ip_address: string }> {
  // 1. Detect Device via User Agent
  const ua = navigator.userAgent;
  let device = 'Desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device = 'Tablet';
  } else if (/mobile|iphone|ipod|android|windows phone/i.test(ua)) {
    device = 'Mobile';
  }

  // 2. Skip browser-side IP lookup because ipapi.co does not expose CORS headers;
  // this telemetry is optional and should never block report generation.
  let location = 'Unknown';
  let ip_address = '';

  if (typeof window === 'undefined' || !('fetch' in window)) {
    return { device, location, ip_address };
  }

  return { device, location, ip_address };
}
