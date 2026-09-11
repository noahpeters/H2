import {useEffect} from 'react';
import {useAnalytics} from '@shopify/hydrogen';
import {useLocation} from 'react-router';
import {
  trackConfiguratorSession,
  setAnalyticsPermission,
} from '~/studio/cabinet-configurator/analyticsSession';
export function ConfiguratorAnalytics() {
  const {canTrack} = useAnalytics();
  const {pathname} = useLocation();
  useEffect(() => {
    setAnalyticsPermission(canTrack);
    const track = () => {
      trackConfiguratorSession();
    };
    let lastActivity = Date.now();
    const activity = () => {
      if (Date.now() - lastActivity < 60000) return;
      lastActivity = Date.now();
      track();
    };
    track();
    document.addEventListener('visitorConsentCollected', track);
    document.addEventListener('pointerdown', activity);
    document.addEventListener('keydown', activity);
    return () => {
      document.removeEventListener('visitorConsentCollected', track);
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('keydown', activity);
    };
  }, [canTrack, pathname]);
  return null;
}
