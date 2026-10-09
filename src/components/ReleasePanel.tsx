import type { NewsFeed } from '../bindings';
import { shortDate } from '../lib/format';

interface ReleasePanelProps {
  feed: NewsFeed | null;
  /** The one line from the manifest, shown when there is no feed. */
  fallbackNotes: string | null;
  /** The release that is found or being installed and cannot be started yet. */
  waiting: string | null;
  /** The last check failed, so the entries are the ones kept on disk. */
  kept: boolean;
  onOpenRelease: (version: string | null) => void;
}

/**
 * The right page: every release as one dated line, newest on top. A line opens
 * the notes of its release. When the feed has news, the page begins with the
 * posts and the releases follow under their own heading. All text comes from
 * the notes feed and is rendered as plain text.
 */
export function ReleasePanel({
  feed,
  fallbackNotes,
  waiting,
  kept,
  onOpenRelease,
}: ReleasePanelProps) {
  const updates = feed?.updates ?? [];
  const news = feed?.news ?? [];
  const count = updates.length;

  const changed = (
    <>
      <span id="what-changed">What changed</span>
      <span>
        {kept && count > 0 && 'as of the last check · '}
        <button type="button" className="lnk" onClick={() => onOpenRelease(null)}>
          {count === 0 ? 'release notes' : count === 1 ? '1 release' : `all ${count} releases`}
        </button>
      </span>
    </>
  );

  return (
    <section className="pg r" aria-labelledby={news.length > 0 ? 'news' : 'what-changed'}>
      <div className="ph">
        {news.length > 0 ? (
          <>
            <span id="news">News</span>
            <span>{news.length === 1 ? '1 post' : `${news.length} posts`}</span>
          </>
        ) : (
          changed
        )}
      </div>
      <div className="rows">
        {news.map((post, index) => (
          <article className="post" key={`${post.title}-${index}`}>
            <h2 className="row new">
              <span className="d">{shortDate(post.date ?? '')}</span>
              <span className="t">{post.title}</span>
            </h2>
            <p>{post.body}</p>
          </article>
        ))}
        {news.length > 0 && <div className="ph">{changed}</div>}
        {updates.map((entry, index) => {
          const wait = entry.version === waiting;
          return (
            <button
              type="button"
              className={`row${index === 0 ? ' new' : ''}${wait ? ' wait' : ''}`}
              key={entry.version}
              onClick={() => onOpenRelease(entry.version)}
            >
              <span className="d">{shortDate(entry.date ?? '')}</span>
              <span className="v">{entry.version}</span>
              <span className="t" title={entry.title}>
                {entry.title || `Version ${entry.version}`}
                {entry.summary && <span className="dim"> {entry.summary}</span>}
              </span>
              {wait && <span className="w">waiting</span>}
            </button>
          );
        })}
        {count === 0 && (
          <p className="empty">
            {fallbackNotes ?? 'Release notes appear here after the first update check.'}
          </p>
        )}
      </div>
    </section>
  );
}
