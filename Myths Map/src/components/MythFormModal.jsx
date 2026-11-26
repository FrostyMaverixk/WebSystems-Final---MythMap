import { useEffect, useRef, useState } from 'react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap.js';
import { reverseGeocodeLocation } from '../services/externalApis.js';
import {
  isImageUploadEnabled,
  uploadMythImage,
  validateMythImage,
} from '../services/imageUpload.js';
import { coordinatesLabel } from '../utils/format.js';

export function MythFormModal({
  isOpen,
  location,
  editingMyth,
  defaultAuthor,
  onSubmit,
  onCancel,
}) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [type, setType] = useState('land');
  const [region, setRegion] = useState('');
  const [story, setStory] = useState('');
  const [source, setSource] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [geoLoading, setGeoLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const regionTouchedRef = useRef(false);
  const uploadAbortRef = useRef(null);
  const fileInputRef = useRef(null);

  const isResubmitting = Boolean(editingMyth);
  const activeLat = isResubmitting ? editingMyth.lat : location?.lat;
  const activeLng = isResubmitting ? editingMyth.lng : location?.lng;
  const uploadEnabled = isImageUploadEnabled();

  const containerRef = useModalFocusTrap(isOpen, onCancel);

  // Initialize form fields whenever modal opens
  useEffect(() => {
    if (!isOpen) {
      uploadAbortRef.current?.abort();
      return undefined;
    }

    regionTouchedRef.current = false;
    setFormError('');
    setUploadError('');
    setUploading(false);
    setUploadProgress(0);

    if (editingMyth) {
      setTitle(editingMyth.title || '');
      setAuthor(editingMyth.author || defaultAuthor || '');
      setType(editingMyth.type === 'sea' ? 'sea' : 'land');
      setRegion(editingMyth.region || '');
      setStory(editingMyth.story || '');
      setSource(editingMyth.source || '');
      setImageUrl(editingMyth.imageUrl || '');
      return undefined;
    }

    setTitle('');
    setAuthor(defaultAuthor || '');
    setType('land');
    setRegion('');
    setStory('');
    setSource('');
    setImageUrl('');

    // Mapbox Geocoding API v6 reverse-geocoding for newly dropped pin
    if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) return undefined;
    const controller = new AbortController();
    setGeoLoading(true);
    reverseGeocodeLocation(location.lat, location.lng, { signal: controller.signal })
      .then((detectedRegion) => {
        if (!controller.signal.aborted && detectedRegion && !regionTouchedRef.current) {
          setRegion(detectedRegion);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setGeoLoading(false);
      });

    return () => {
      controller.abort();
      setGeoLoading(false);
    };
  }, [isOpen, editingMyth, location?.lat, location?.lng, defaultAuthor]);

  if (!isOpen) return null;

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError('');
    const check = validateMythImage(file);
    if (!check.valid) {
      setUploadError(check.error);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    setUploading(true);
    setUploadProgress(5);
    try {
      const result = await uploadMythImage(file, {
        signal: controller.signal,
        onProgress: (pct) => setUploadProgress(pct),
      });
      setImageUrl(result.imageUrl);
      setUploadError('');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setUploadError(err?.message || 'Image upload failed.');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    uploadAbortRef.current?.abort();
    setUploading(false);
    setUploadProgress(0);
    setImageUrl('');
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (uploading || submitting) return;
    setFormError('');
    setSubmitting(true);
    try {
      await onSubmit({
        mythId: editingMyth?.id || null,
        title: title.trim(),
        author: author.trim(),
        type,
        region: region.trim(),
        story: story.trim(),
        source: source.trim(),
        lat: Number(activeLat),
        lng: Number(activeLng),
        imageUrl: imageUrl.trim(),
      });
    } catch (err) {
      setFormError(err?.message || 'Could not save your story.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="myth-form"
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="myth-form-heading"
      ref={containerRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <section className="panel form-panel">
        <button
          type="button"
          className="close-button"
          aria-label="Close form"
          onClick={onCancel}
        >
          ×
        </button>
        <p className="eyebrow">{isResubmitting ? 'REVISE YOUR SUBMISSION' : 'ADD YOUR VOICE'}</p>
        <h2 id="myth-form-heading">
          {isResubmitting ? 'Edit & resubmit myth' : 'Share a local myth'}
        </h2>
        <p className="panel-intro">
          {isResubmitting
            ? 'Address the administrator’s notes and resubmit. Your previous feedback timeline will remain attached.'
            : 'Keep a tale alive. Your story will appear on the map after an administrator reviews it.'}
        </p>

        <p id="location-label" className="location-label">
          Pinned at {coordinatesLabel({ lat: activeLat, lng: activeLng })}
        </p>

        {isResubmitting && editingMyth.reviewNote && (
          <p className="review-note form-review-note">
            <strong>Latest reviewer note:</strong> {editingMyth.reviewNote}
          </p>
        )}

        <form id="submit-form" onSubmit={handleSubmit}>
          <label htmlFor="myth-title">Story title</label>
          <input
            id="myth-title"
            required
            minLength={3}
            maxLength={100}
            placeholder="What is this tale called?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="two-columns">
            <div>
              <label htmlFor="myth-author">Your name / credit</label>
              <input
                id="myth-author"
                required
                minLength={2}
                maxLength={80}
                placeholder="Who is sharing this tale?"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="myth-type">Category</label>
              <select id="myth-type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="land">Land spirit</option>
                <option value="sea">Sea creature</option>
              </select>
            </div>
          </div>

          <div className="label-row">
            <label htmlFor="myth-region">
              Region or place <span className="optional">(optional)</span>
            </label>
            {geoLoading && <span className="geo-hint">Detecting region…</span>}
          </div>
          <input
            id="myth-region"
            maxLength={80}
            placeholder="e.g. Iloilo City, Western Visayas"
            value={region}
            onChange={(e) => {
              regionTouchedRef.current = true;
              setRegion(e.target.value);
            }}
          />

          <div className="label-row">
            <label htmlFor="myth-story">The story</label>
            <span id="story-count">{story.length.toLocaleString()} / 10,000</span>
          </div>
          <textarea
            id="myth-story"
            required
            minLength={20}
            maxLength={10000}
            rows={6}
            placeholder="Tell us the legend, where you heard it, and what makes it special…"
            value={story}
            onChange={(e) => setStory(e.target.value)}
          />

          <label htmlFor="myth-source">
            Source or attribution <span className="optional">(optional)</span>
          </label>
          <input
            id="myth-source"
            maxLength={300}
            placeholder="A book, a link, or the person who told you"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />

          <div className="upload-block">
            <label htmlFor="myth-image-input">
              Attach artwork or photo <span className="optional">(optional · PNG, JPEG, WebP · max 5 MB)</span>
            </label>

            {uploadEnabled ? (
              <>
                <input
                  id="myth-image-input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={handleFileChange}
                />
                {uploading && (
                  <div className="upload-progress" role="status" aria-live="polite">
                    <div className="upload-progress-bar">
                      <div style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span>Uploading image… {uploadProgress}%</span>
                  </div>
                )}
              </>
            ) : (
              <p className="upload-setup-note">
                Image uploads are currently unavailable. You can still share your myth without an
                image.
              </p>
            )}

            {uploadError && (
              <p className="form-error" role="alert">
                {uploadError}
              </p>
            )}

            {imageUrl && (
              <div className="upload-preview">
                <img src={imageUrl} alt="Uploaded myth preview" />
                <div className="upload-preview-actions">
                  <span>Attached image ready</span>
                  <button type="button" className="remove-record" onClick={handleRemoveImage}>
                    Remove image
                  </button>
                </div>
              </div>
            )}
          </div>

          {formError && (
            <p id="form-error" role="alert" className="form-error">
              {formError}
            </p>
          )}

          <div className="form-actions">
            <button id="cancel-form" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              id="submit-myth"
              type="submit"
              className="accent-button"
              disabled={uploading || submitting}
            >
              {uploading
                ? 'Waiting for image…'
                : submitting
                ? 'Submitting…'
                : isResubmitting
                ? 'Resubmit for review ↗'
                : 'Submit for review ↗'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
