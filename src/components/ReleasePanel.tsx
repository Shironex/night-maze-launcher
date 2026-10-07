import { useState } from 'react';
import type { LocalNotice, NewsFeed, ReleaseNotes } from '../bindings';
import { shortDate } from '../lib/format';
import { localNoticeText } from '../state/view';

type TabId = 'updates' | 'news' | 'notices';

interface ReleasePanelProps {
  feed: NewsFeed | null;
  /** The one line from the manifest, shown when there is no feed. */
  fallbackNotes: string | null;
  localNotices: LocalNotice[];
  onOpenRelease: (version: string | null) => void;
}

/**
 * The highlight card and the tabbed list under it: release notes, news and
 * notices. All text comes from the notes feed and is rendered as plain text.
 */
export function ReleasePanel({
  feed,
  fallbackNotes,
  localNotices,
  onOpenRelease,
}: ReleasePanelProps) {
  const [chosen, setChosen] = useState<TabId>('updates');
  const updates = feed?.updates ?? [];
  const news = feed?.news ?? [];
  const remoteNotices = feed?.notices ?? [];
  const noticeCount = remoteNotices.length + localNotices.length;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'updates', label: 'Updates' },
    // The News tab can stay empty for months, so it only exists with posts.
    ...(news.length > 0 ? [{ id: 'news' as const, label: 'News' }] : []),
    { id: 'notices', label: 'Notices', count: noticeCount > 0 ? noticeCount : undefined },
  ];
  const active = tabs.some(tab => tab.id === chosen) ? chosen : 'updates';
  const highlight = updates.find(entry => entry.highlight) ?? updates[0];

  return (
    <>
      {highlight && <HighlightCard release={highlight} onOpen={onOpenRelease} />}
      <div className="tabs">
        <div className="tabs-row" role="tablist" aria-label="Release information">
          {tabs.map(tab => (
            <button
              type="button"
              role="tab"
              key={tab.id}
              id={`tab-${tab.id}`}
              className="tab"
              aria-selected={tab.id === active}
              aria-controls="tab-panel"
              onClick={() => setChosen(tab.id)}
            >
              {tab.label}
              {tab.count !== undefined && <b>{tab.count}</b>}
            </button>
          ))}
        </div>
        <div className="tab-panel" id="tab-panel" role="tabpanel" aria-labelledby={`tab-${active}`}>
          {active === 'updates' &&
            (updates.length > 0 ? (
              updates.map(entry => (
                <button
                  type="button"
                  className="rel"
                  key={entry.version}
                  onClick={() => onOpenRelease(entry.version)}
                >
                  <span className="v">v{entry.version}</span>
                  <span className="t">{entry.title || `Version ${entry.version}`}</span>
                  <span className="d">{shortDate(entry.date ?? '')}</span>
                </button>
              ))
            ) : (
              <p className="empty">
                {fallbackNotes ?? 'Release notes appear here after the first update check.'}
              </p>
            ))}
          {active === 'news' &&
            news.map((post, index) => (
              <div className="post" key={`${post.title}-${index}`}>
                <span className="k">{shortDate(post.date ?? '')}</span>
                <b>{post.title}</b>
                <span>{post.body}</span>
              </div>
            ))}
          {active === 'notices' &&
            (noticeCount > 0 ? (
              <>
                {localNotices.map(notice => (
                  <div className="post" key={notice.id}>
                    <span className="k">This computer</span>
                    <b>{localNoticeText(notice)}</b>
                    {notice.detail && <span>{notice.detail}</span>}
                  </div>
                ))}
                {remoteNotices.map((notice, index) => (
                  <div className="post" key={`${notice.id}-${index}`}>
                    <span className="k">{notice.level === 'warning' ? 'Warning' : 'Notice'}</span>
                    <b>{notice.title}</b>
                    <span>{notice.body}</span>
                  </div>
                ))}
              </>
            ) : (
              <p className="empty">No notices.</p>
            ))}
        </div>
      </div>
    </>
  );
}

interface HighlightCardProps {
  release: ReleaseNotes;
  onOpen: (version: string | null) => void;
}

/** The card above the tabs. It opens the notes of the highlighted release. */
function HighlightCard({ release, onOpen }: HighlightCardProps) {
  return (
    <button type="button" className="hl" onClick={() => onOpen(release.version)}>
      <svg viewBox="0 0 276 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="276" height="80" fill="url(#g-sky)" />
        <path d="M150 80L205 44h71v36z" fill="url(#g-floor)" />
        <path d="M276 0L205 20v26l71 34z" fill="url(#g-wall-r)" />
        <ellipse cx="215" cy="62" rx="60" ry="20" fill="url(#g-warm)" />
        <circle cx="222" cy="40" r="34" fill="url(#g-cry)" />
        <path
          d="M222 20l10 16-10 24-10-24z"
          fill="var(--l-crystal)"
          stroke="var(--l-moon)"
          strokeWidth="1"
        />
        <rect width="276" height="80" fill="url(#g-left)" />
      </svg>
      <span className="hl-text">
        <span className="k">v{release.version} · Highlight</span>
        <span className="h">{release.title || `Version ${release.version}`}</span>
        <span className="d">{release.summary}</span>
      </span>
    </button>
  );
}
