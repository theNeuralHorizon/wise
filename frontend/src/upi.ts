import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export async function openUpiDeeplink(upiUrl: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.open({ url: upiUrl, presentationStyle: 'popover' });
    } catch {
      window.location.href = upiUrl;
    }
  } else {
    window.open(upiUrl, '_self');
  }
}
