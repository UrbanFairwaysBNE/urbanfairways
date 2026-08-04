import { useEffect, useMemo, useRef, useState } from "react";

interface EmailPreviewFrameProps {
  html: string;
  className?: string;
  /** Max height of the scrollable viewport */
  maxHeightClassName?: string;
}

const RESPONSIVE_CSS = `
  html, body { margin:0; padding:0; width:100%; max-width:100%; overflow-x:hidden; -webkit-text-size-adjust:100%; }
  body { word-wrap:break-word; overflow-wrap:break-word; }
  img { max-width:100% !important; height:auto !important; display:block; }
  table { max-width:100% !important; border-collapse:collapse; }
  td, th { word-break:break-word; overflow-wrap:break-word; }
  pre, code { white-space:pre-wrap; word-break:break-word; }
  a { word-break:break-word; }
  * { box-sizing:border-box; }
`;

const HEIGHT_SCRIPT = `
<script>
  (function () {
    var last = 0;
    function post() {
      var h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      if (h && h !== last) {
        last = h;
        parent.postMessage({ type: 'email-preview-height', height: h }, '*');
      }
    }
    post();
    [50, 150, 300, 600, 1000, 1800].forEach(function (t) { setTimeout(post, t); });
    window.addEventListener('load', post);
    if (window.ResizeObserver) new ResizeObserver(post).observe(document.documentElement);
    document.addEventListener('load', post, true);
  })();
<\/script>
`;

function wrapHtml(html: string) {
  const hasDoc = /<html[\s>]/i.test(html);
  const styleTag = `<style>${RESPONSIVE_CSS}</style>`;
  const head = `<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${styleTag}`;

  if (hasDoc) {
    let out = html;
    if (/<head[\s>]/i.test(out)) {
      out = out.replace(/<head([^>]*)>/i, `<head$1>${head}`);
    } else {
      out = out.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`);
    }
    return out.replace(/<\/body>/i, `${HEIGHT_SCRIPT}</body>`);
  }

  return `<!doctype html><html><head>${head}</head><body>${html}${HEIGHT_SCRIPT}</body></html>`;
}

export function EmailPreviewFrame({
  html,
  className = "",
  maxHeightClassName = "max-h-[65vh]",
}: EmailPreviewFrameProps) {
  const [height, setHeight] = useState(500);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => wrapHtml(html || ""), [html]);

  useEffect(() => {
    setHeight(500);
    const onMessage = (e: MessageEvent) => {
      if (!e.data || e.data.type !== "email-preview-height") return;
      if (frameRef.current && e.source !== frameRef.current.contentWindow) return;
      const h = Number(e.data.height);
      if (h > 0) setHeight(Math.min(h + 24, 20000));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [srcDoc]);

  return (
    <div
      className={`border rounded-lg bg-white overflow-y-auto overflow-x-hidden overscroll-contain ${maxHeightClassName} ${className}`}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <iframe
        ref={frameRef}
        srcDoc={srcDoc}
        scrolling="no"
        className="w-full border-0 block"
        style={{ height }}
        title="Email preview"
      />
    </div>
  );
}
