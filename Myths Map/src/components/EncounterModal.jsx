import { useEffect, useRef } from 'react';

export function EncounterModal({ story, highQuality, isDay, onClose, onError }) {
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  const viewRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  const atmosphereRef = useRef({ highQuality, isDay: isDay ?? 1 });
  onCloseRef.current = onClose;
  onErrorRef.current = onError;
  atmosphereRef.current = { highQuality, isDay: isDay ?? 1 };

  const isOpen = Boolean(story);

  // Lazy-load EncounterView on demand with a fresh <canvas> per open session so
  // forceContextLoss() on close never poisons subsequent 3D creature encounters.
  useEffect(() => {
    if (!story) {
      if (viewRef.current) {
        viewRef.current.dispose();
        viewRef.current = null;
      }
      stageRef.current?.replaceChildren();
      return undefined;
    }

    let cancelled = false;
    let instance = null;

    async function launch() {
      try {
        const { EncounterView } = await import('../engine/encounter-view.js');
        if (cancelled) return;
        const dialog = dialogRef.current;
        const stage = stageRef.current;
        if (!dialog || !stage) return;

        const canvas = document.createElement('canvas');
        canvas.id = 'encounter-canvas';
        canvas.tabIndex = 0;
        canvas.setAttribute(
          'aria-label',
          '3D creature. Use the arrow keys to rotate and plus or minus to zoom.'
        );
        stage.replaceChildren(canvas);

        instance = new EncounterView({
          dialog,
          canvas,
          onClose: () => {
            if (!cancelled) onCloseRef.current?.();
          },
        });
        viewRef.current = instance;
        instance.open(story, atmosphereRef.current.highQuality, {
          isDay: atmosphereRef.current.isDay,
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Creature encounter could not open', error);
        instance?.dispose();
        stageRef.current?.replaceChildren();
        viewRef.current = null;
        onErrorRef.current?.('The 3D view needs WebGL. The illustrated story is still available.');
        onCloseRef.current?.();
      }
    }

    launch();

    return () => {
      cancelled = true;
      if (instance) {
        instance.dispose();
        if (viewRef.current === instance) viewRef.current = null;
      }
      stageRef.current?.replaceChildren();
    };
  }, [story]);

  // Sync live weather day/night tint and Effects toggle while open.
  useEffect(() => {
    if (!isOpen || !viewRef.current) return;
    viewRef.current.setAtmosphere({ effects: highQuality, isDay: isDay ?? 1 });
  }, [isOpen, highQuality, isDay]);

  return (
    <dialog
      id="encounter-view"
      ref={dialogRef}
      aria-labelledby="encounter-title"
      aria-describedby="encounter-help"
    >
      <header className="encounter-heading">
        <div>
          <p className="eyebrow">Creature encounter</p>
          <h2 id="encounter-title">{story?.name || story?.title || ''}</h2>
        </div>
        <button
          type="button"
          id="return-to-map"
          onClick={() => {
            if (viewRef.current) viewRef.current.close();
            else onClose?.();
          }}
        >
          ← Return to atlas
        </button>
      </header>
      <div className="encounter-stage" ref={stageRef} />
      <footer className="encounter-footer">
        <span id="encounter-help">
          Drag to turn · Scroll or pinch to zoom
          {highQuality && isDay === 0 ? ' · Dusk atmosphere (live local night)' : ''}
        </span>
        <div>
          <button
            id="encounter-out"
            aria-label="Zoom out of creature view"
            type="button"
            onClick={() => viewRef.current?.zoom(1 / 1.15)}
          >
            −
          </button>
          <button
            id="encounter-in"
            aria-label="Zoom in on creature"
            type="button"
            onClick={() => viewRef.current?.zoom(1.15)}
          >
            +
          </button>
        </div>
      </footer>
    </dialog>
  );
}
