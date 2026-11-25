import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MAPBOX_STYLE, MAPBOX_TOKEN } from '../config/appConfig.js';
import { STYLE_URL, useLocalCoastline } from '../engine/config.js';

let mapboxLoaderPromise = null;

function loadMapbox() {
  if (globalThis.mapboxgl) return Promise.resolve();
  if (!mapboxLoaderPromise) {
    mapboxLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/assets/mapbox-gl-3.35.2/mapbox-gl.js';
      script.onload = () => {
        if (globalThis.mapboxgl) resolve();
        else {
          mapboxLoaderPromise = null;
          reject(new Error('Mapbox GL JS could not initialize.'));
        }
      };
      script.onerror = () => {
        script.remove();
        mapboxLoaderPromise = null;
        reject(new Error('Mapbox GL JS could not load.'));
      };
      document.head.append(script);
    });
  }
  return mapboxLoaderPromise;
}

const DEFAULT_STATUS = 'Drag to explore · Scroll to zoom · Select a creature to read its story';

export const MapCanvas = forwardRef(function MapCanvas(
  {
    builtinCreatures,
    communityMyths,
    communityMarker,
    filterType,
    filteredIds,
    highQuality,
    placingPin,
    canWrite,
    windSpeed,
    encounterOpen,
    statusOverride,
    onToggleQuality,
    onResetMap,
    onSelectStory,
    onClearSelection,
    onPinLocation,
    onPinOutOfBounds,
    onCancelPin,
    onReadyChange,
  },
  ref
) {
  const mapContainerRef = useRef(null);
  const noticeRef = useRef(null);
  const worldRef = useRef(null);
  const removeInteractionRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState('');
  const [mapStatus, setMapStatus] = useState('Charting the Philippine isles…');
  const [retryNonce, setRetryNonce] = useState(0);
  const [worldVersion, setWorldVersion] = useState(0);

  const stateRef = useRef({ placingPin, canWrite });
  stateRef.current = { placingPin, canWrite };

  const callbacksRef = useRef({});
  callbacksRef.current = {
    onSelectStory,
    onClearSelection,
    onPinLocation,
    onPinOutOfBounds,
    onCancelPin,
    onResetMap,
    onReadyChange,
  };

  const initialPropsRef = useRef({
    builtinCreatures,
    communityMyths,
    communityMarker,
    filterType,
    filteredIds,
    highQuality,
    windSpeed,
    encounterOpen,
  });
  initialPropsRef.current = {
    builtinCreatures,
    communityMyths,
    communityMarker,
    filterType,
    filteredIds,
    highQuality,
    windSpeed,
    encounterOpen,
  };

  useImperativeHandle(ref, () => ({
    focusOn(lat, lng) {
      worldRef.current?.focusOn(lat, lng);
    },
    fitCameraToWorld() {
      worldRef.current?.fitCameraToWorld();
    },
    zoomBy(delta) {
      worldRef.current?.zoomBy(delta);
    },
  }));

  // StrictMode-safe mount & teardown of Mapbox GL + Three.js World
  useEffect(() => {
    const container = mapContainerRef.current;
    const notice = noticeRef.current;
    if (!container) return undefined;

    let active = true;
    let localWorld = null;
    let removeInteraction = null;
    let reported = '';

    const report = (message) => {
      if (!active) return;
      reported = message;
      setMapError(message);
      setMapStatus(`${message} You can still read stories in Discover.`);
    };

    const observer = new ResizeObserver((entries) => {
      for (const { target } of entries) {
        if (target === container) worldRef.current?.resize();
        else if (target === notice) {
          document.documentElement.style.setProperty(
            '--notice-clearance',
            `${Math.max(38, Math.ceil(target.getBoundingClientRect().height) + 4)}px`
          );
        }
      }
    });
    observer.observe(container);
    if (notice) observer.observe(notice);

    async function boot() {
      setLoading(true);
      setMapError('');
      setMapStatus('Charting the Philippine isles…');
      callbacksRef.current.onReadyChange?.(false);

      try {
        if (!MAPBOX_TOKEN) {
          throw new Error('Set VITE_MAPBOX_TOKEN in .env to load the interactive Mapbox atlas.');
        }

        const [, { World }, { setupInteraction }] = await Promise.all([
          loadMapbox(),
          import('../engine/world.js'),
          import('../engine/interaction.js'),
        ]);
        if (!active) return;

        let styleConfig = MAPBOX_STYLE;
        if (!styleConfig) {
          const response = await fetch(STYLE_URL);
          if (!response.ok) throw new Error('The bundled atlas style could not be loaded.');
          styleConfig = useLocalCoastline(await response.json(), window.location.origin);
        }
        if (!active) return;

        const init = initialPropsRef.current;
        localWorld = new World(
          container,
          {
            mapboxToken: MAPBOX_TOKEN,
            mapboxStyle: styleConfig,
            creatures: init.builtinCreatures,
            communityMarker: init.communityMarker,
            highQuality: init.highQuality,
          },
          report
        );

        await localWorld.load();
        if (!active) {
          localWorld.dispose();
          localWorld = null;
          return;
        }

        // Apply latest React state immediately after load finishes.
        const latest = initialPropsRef.current;
        localWorld.setBuiltinCreatures(latest.builtinCreatures, latest.communityMarker);
        localWorld.setCommunityMyths(latest.communityMyths);
        localWorld.setFilters(latest.filterType, latest.filteredIds);
        localWorld.setHighQuality(latest.highQuality);
        localWorld.setWindSpeed(latest.windSpeed);
        localWorld.setEncounterOpen(latest.encounterOpen);

        worldRef.current = localWorld;
        removeInteraction = setupInteraction({
          canvas: container,
          world: localWorld,
          stateRef,
          callbacks: {
            onSelectStory: (story) => callbacksRef.current.onSelectStory?.(story),
            onClearSelection: () => callbacksRef.current.onClearSelection?.(),
            onPinLocation: (lat, lng) => callbacksRef.current.onPinLocation?.(lat, lng),
            onPinOutOfBounds: () => callbacksRef.current.onPinOutOfBounds?.(),
            onCancelPin: () => callbacksRef.current.onCancelPin?.(),
            onResetMap: () => callbacksRef.current.onResetMap?.(),
          },
        });
        removeInteractionRef.current = removeInteraction;

        callbacksRef.current.onReadyChange?.(true);
        setWorldVersion((v) => v + 1);
        if (!reported) setMapStatus(DEFAULT_STATUS);
      } catch (error) {
        if (!active) return;
        localWorld?.dispose();
        localWorld = null;
        worldRef.current = null;
        callbacksRef.current.onReadyChange?.(false);
        report(error?.message || 'The interactive map could not start.');
      } finally {
        if (active) setLoading(false);
      }
    }

    boot();

    return () => {
      active = false;
      observer.disconnect();
      removeInteraction?.();
      removeInteractionRef.current?.();
      removeInteractionRef.current = null;
      localWorld?.dispose();
      if (worldRef.current === localWorld) worldRef.current = null;
      callbacksRef.current.onReadyChange?.(false);
    };
  }, [retryNonce]);

  // Sync dynamic props into imperative World instance
  useEffect(() => {
    worldRef.current?.setBuiltinCreatures(builtinCreatures, communityMarker);
  }, [builtinCreatures, communityMarker, worldVersion]);

  useEffect(() => {
    worldRef.current?.setCommunityMyths(communityMyths);
  }, [communityMyths, worldVersion]);

  useEffect(() => {
    worldRef.current?.setFilters(filterType, filteredIds);
  }, [filterType, filteredIds, worldVersion]);

  useEffect(() => {
    worldRef.current?.setHighQuality(highQuality);
  }, [highQuality, worldVersion]);

  useEffect(() => {
    worldRef.current?.setWindSpeed(windSpeed);
  }, [windSpeed, worldVersion]);

  useEffect(() => {
    worldRef.current?.setEncounterOpen(encounterOpen);
  }, [encounterOpen, worldVersion]);

  const displayedStatus = statusOverride || mapStatus;

  return (
    <>
      <div
        id="map"
        ref={mapContainerRef}
        className={placingPin ? 'placing-pin' : undefined}
        role="region"
        tabIndex={0}
        aria-label="Interactive map of Philippine folklore. Drag to pan, scroll to zoom, or use arrow keys and plus or minus. Press Home to reset."
      />
      <div id="vignette" aria-hidden="true" />
      <div id="grain" aria-hidden="true" />

      <div className="map-caption" aria-hidden="true">
        <span>THE PHILIPPINE</span>
        <strong>Archipelago</strong>
        <span>AN EXPLORER’S COLLECTION</span>
      </div>

      <div id="legend" className="map-legend">
        <span><i className="land-dot" /> Land spirits</span>
        <span><i className="sea-dot" /> Sea creatures</span>
        <span><i className="community-dot" /> Community tales</span>
      </div>

      <div id="controls" className="map-controls" aria-label="Map controls">
        <button
          id="quality-toggle"
          type="button"
          aria-pressed={String(highQuality)}
          onClick={onToggleQuality}
        >
          {highQuality ? 'Effects: on' : 'Effects: off'}
        </button>
        <button
          id="reset-map"
          type="button"
          title="Reset map view (Home)"
          onClick={onResetMap}
        >
          Reset view
        </button>
        <div id="zoom-controls">
          <button
            id="zoom-in"
            type="button"
            aria-label="Zoom in"
            onClick={() => worldRef.current?.zoomBy(1)}
          >
            +
          </button>
          <button
            id="zoom-out"
            type="button"
            aria-label="Zoom out"
            onClick={() => worldRef.current?.zoomBy(-1)}
          >
            −
          </button>
        </div>
      </div>

      <div id="compass-rose" aria-hidden="true">
        <span>N</span>
        <svg viewBox="0 0 100 100">
          <path d="M50 7 58 42 93 50 58 58 50 93 42 58 7 50 42 42Z" fill="none" stroke="currentColor" />
          <path d="M50 7 58 42 50 50 42 42Z" fill="currentColor" />
          <path d="M50 93 42 58 50 50 58 58Z" fill="currentColor" opacity=".4" />
          <circle cx="50" cy="50" r="19" fill="none" stroke="currentColor" />
          <circle cx="50" cy="50" r="3" fill="currentColor" />
        </svg>
      </div>

      <div className="map-notice" ref={noticeRef}>
        {loading && (
          <div id="loading" role="status">
            <span className="live-dot" /> Charting the isles…
          </div>
        )}
        <p id="map-status" role="status" aria-live="polite">
          {displayedStatus}
        </p>
        {mapError && (
          <button
            id="retry-map"
            className="text-button"
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
          >
            Reload map
          </button>
        )}
        <span className="notice-attribution">
          Weather by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
            Open-Meteo.com
          </a>
        </span>
      </div>
    </>
  );
});
