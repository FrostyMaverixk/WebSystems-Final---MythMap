export function Toast({ message }) {
  if (!message) return null;
  return (
    <div id="toast" className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
