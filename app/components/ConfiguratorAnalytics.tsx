import {useEffect} from 'react';
import {useLocation} from 'react-router';
import {trackConfiguratorSession} from '~/studio/cabinet-configurator/analyticsSession';
export function ConfiguratorAnalytics() {
  const {pathname} = useLocation();
  useEffect(() => {
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
    document.addEventListener('pointerdown', activity);
    document.addEventListener('keydown', activity);
    return () => {
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('keydown', activity);
    };
  }, [pathname]);
  return null;
}
