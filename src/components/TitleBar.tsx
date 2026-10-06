import { getCurrentWindow } from '@tauri-apps/api/window';
import { Icon } from './Icon';

/** macOS keeps its own window buttons in the transparent title bar. */
const NATIVE_CONTROLS = navigator.userAgent.includes('Mac OS X');

/**
 * The top strip of the frameless window: a drag area across the full width
 * and, on Windows, the window buttons at the top right.
 */
export function TitleBar() {
  return (
    <>
      <div className="w-drag" data-tauri-drag-region />
      {!NATIVE_CONTROLS && (
        <div className="w-ctl">
          <button
            type="button"
            aria-label="Minimise"
            onClick={() => void getCurrentWindow().minimize()}
          >
            <Icon name="minimize" />
          </button>
          <button
            type="button"
            aria-label="Maximise or restore"
            onClick={() => void getCurrentWindow().toggleMaximize()}
          >
            <Icon name="maximize" />
          </button>
          <button type="button" aria-label="Close" onClick={() => void getCurrentWindow().close()}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}
