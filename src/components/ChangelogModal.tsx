import { useState } from 'react';
import type { ReleaseNotes } from '../bindings';
import { longDate, shortDate } from '../lib/format';
import { Modal } from './Modal';

interface ChangelogModalProps {
  releases: ReleaseNotes[];
  /** The version to show first. */
  initialVersion: string | null;
  onClose: () => void;
}

/**
 * All release notes: the list on the left, one release written out on the
 * right. Every string comes from the notes feed and is rendered as plain text.
 */
export function ChangelogModal({ releases, initialVersion, onClose }: ChangelogModalProps) {
  const [selected, setSelected] = useState(initialVersion ?? releases[0]?.version ?? null);
  const release = releases.find(entry => entry.version === selected) ?? releases[0];

  const side = (
    <>
      <div className="m-brand">
        <b>Night Maze</b>
        <span>
          Changelog · {releases.length} {releases.length === 1 ? 'release' : 'releases'}
        </span>
      </div>
      <div role="tablist" aria-label="Releases" aria-orientation="vertical">
        {releases.map(entry => (
          <button
            type="button"
            role="tab"
            key={entry.version}
            className="cl-item"
            aria-selected={entry.version === release?.version}
            onClick={() => setSelected(entry.version)}
          >
            <i />
            <div>
              <b>{entry.title || `Version ${entry.version}`}</b>
              <span>
                v{entry.version}
                {entry.date ? ` · ${shortDate(entry.date)}` : ''}
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <Modal label="Changelog" onClose={onClose} side={side}>
      {release ? (
        <div role="tabpanel" className="selectable">
          <div className="cl-meta">
            <span className="v">v{release.version}</span>
            {release.date && <span>{longDate(release.date)}</span>}
            {release.tag && <span className="tagp">{release.tag}</span>}
          </div>
          <h2 className="m-h" style={{ marginTop: '0.25em' }}>
            {release.title || `Version ${release.version}`}
          </h2>
          {release.summary && <p className="cl-intro">{release.summary}</p>}
          {(release.groups ?? []).map((group, index) => (
            <section className="cl-g" key={`${group.title}-${index}`}>
              <h3>{group.title}</h3>
              <ul>
                {(group.items ?? []).map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <>
          <h2 className="m-h">No release notes yet</h2>
          <p className="m-sub">They appear here after the first successful update check.</p>
        </>
      )}
    </Modal>
  );
}
