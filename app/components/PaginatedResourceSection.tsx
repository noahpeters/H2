import * as React from 'react';
import {useLocation, useNavigate} from 'react-router';
import {Pagination} from '@shopify/hydrogen';

/**
 * <PaginatedResourceSection > is a component that encapsulate how the previous and next behaviors throughout your application.
 */
export function PaginatedResourceSection<NodesType>({
  connection,
  children,
  resourcesClassName,
}: {
  connection: React.ComponentProps<typeof Pagination<NodesType>>['connection'];
  children: React.FunctionComponent<{node: NodesType; index: number}>;
  resourcesClassName?: string;
}) {
  return (
    <Pagination connection={connection}>
      {({nodes, isLoading, hasNextPage, nextPageUrl, state}) => {
        const resourcesMarkup = nodes.map((node, index) =>
          children({node, index}),
        );

        return (
          <div>
            <PaginationUrlCleaner state={state} />
            {resourcesClassName ? (
              <div className={resourcesClassName}>{resourcesMarkup}</div>
            ) : (
              resourcesMarkup
            )}
            <AutoLoadMore
              hasNextPage={hasNextPage}
              isLoading={isLoading}
              nextPageUrl={nextPageUrl}
              state={state}
            />
          </div>
        );
      }}
    </Pagination>
  );
}

function PaginationUrlCleaner<NodesType>({
  state,
}: {
  state: {
    nodes: Array<NodesType>;
    pageInfo: {
      endCursor?: string | null;
      startCursor?: string | null;
      hasPreviousPage: boolean;
    };
  };
}) {
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!location.search) return;

    const params = new URLSearchParams(location.search);
    const hasPaginationParams = params.has('cursor') || params.has('direction');

    if (!hasPaginationParams) return;

    params.delete('cursor');
    params.delete('direction');

    const cleanSearch = params.toString();
    const cleanUrl = cleanSearch
      ? `${location.pathname}?${cleanSearch}`
      : location.pathname;

    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(window.history.state, '', cleanUrl);
    } else {
      navigate(cleanUrl, {replace: true});
    }
  }, [location.pathname, location.search, navigate, state]);

  return null;
}

function AutoLoadMore<NodesType>({
  hasNextPage,
  isLoading,
  nextPageUrl,
  state,
}: {
  hasNextPage: boolean;
  isLoading: boolean;
  nextPageUrl: string;
  state: {
    nodes: Array<NodesType>;
    pageInfo: {
      endCursor?: string | null;
      startCursor?: string | null;
      hasPreviousPage: boolean;
    };
  };
}) {
  const navigate = useNavigate();
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const pendingRef = React.useRef(false);
  const [supportsObserver, setSupportsObserver] = React.useState(false);

  React.useEffect(() => {
    setSupportsObserver('IntersectionObserver' in window);
  }, []);

  React.useEffect(() => {
    if (!hasNextPage || isLoading) {
      pendingRef.current = false;
      return;
    }

    if (!supportsObserver) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (
        entries[0]?.isIntersecting &&
        hasNextPage &&
        !isLoading &&
        !pendingRef.current
      ) {
        pendingRef.current = true;
        navigate(nextPageUrl, {
          state,
          preventScrollReset: true,
        });
      }
    });

    const node = sentinelRef.current;
    if (node) observer.observe(node);

    return () => observer.disconnect();
  }, [hasNextPage, isLoading, navigate, nextPageUrl, state, supportsObserver]);

  if (!hasNextPage) return null;

  return (
    <div ref={sentinelRef} aria-hidden style={{height: 1, width: '100%'}}>
      {!supportsObserver ? (
        <button
          type="button"
          onClick={() =>
            navigate(nextPageUrl, {
              state,
              preventScrollReset: true,
            })
          }
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Load more'}
        </button>
      ) : isLoading ? (
        'Loading...'
      ) : null}
    </div>
  );
}
