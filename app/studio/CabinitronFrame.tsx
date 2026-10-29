import {useEffect, useRef, useState} from 'react';
import {useLocation} from 'react-router';
import {cabinitronInstallationUrl} from './cabinitronEmbed';

export function CabinitronFrame({designerUrl}: {designerUrl: string}) {
  const {hash, key} = useLocation();
  const navigation = JSON.stringify([designerUrl, key, hash]);
  const previous = useRef<{navigation: string; src: string} | null>(null);
  const [resolved, setResolved] = useState<typeof previous.current>(null);

  useEffect(() => {
    // Effects can replay in StrictMode after the fragment has been consumed.
    // Reuse that navigation's URL so the real test token is not replaced by staff.
    if (previous.current?.navigation !== navigation) {
      previous.current = {
        navigation,
        src: cabinitronInstallationUrl(designerUrl, window),
      };
    }
    setResolved(previous.current);
  }, [designerUrl, navigation]);

  // Resolve the host-page fragment before the first iframe navigation. Loading
  // first without the test marker could incorrectly record a visitor session.
  if (resolved?.navigation !== navigation) {
    return (
      <div className="studio-cabinitron-frame" role="status">
        Opening designer…
      </div>
    );
  }
  return (
    <iframe
      className="studio-cabinitron-frame"
      src={resolved.src}
      title="From Trees cabinet designer"
      allow="fullscreen"
      referrerPolicy="origin"
    />
  );
}
