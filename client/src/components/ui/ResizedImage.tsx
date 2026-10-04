import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// An image shown at the size of where it sits, without downloading its
// original: for one of our media files, the server returns a copy reduced to
// the width asked for ("?w=", routes/attachments.ts), made on first request
// and then kept. The original stays on disk, untouched — a wider section
// later asks for a wider copy.
//
// The width asked for is the one the image takes on screen, times the
// screen's density, rounded up to the server's steps (VARIANT_WIDTHS,
// lib/media.ts): a section resized pixel by pixel does not request a new
// file at each step. It only ever grows: a section that narrows keeps the
// copy it has, already sharp enough.

/** The server's steps, from lib/media.ts. */
const STEPS = [320, 480, 640, 800, 1024, 1280, 1600, 1920, 2560];

/** Our media addresses, the only ones the server can reduce. */
const isMedia = (src: string) => /^\/api\/medias?\/[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/.test(src);

const stepFor = (pixels: number) => STEPS.find((s) => s >= pixels) ?? STEPS[STEPS.length - 1]!;

interface ResizedImageProps {
  src: string;
  alt?: string;
  /** As "object-fit": "cover" crops, so a fixed height may call for more width. */
  fit?: "cover" | "contain";
  /** The fixed height, in pixels; nothing: the one its width gives it. */
  height?: number;
  style?: CSSProperties;
}

export default function ResizedImage({ src, alt = "", fit = "cover", height, style }: ResizedImageProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [width, setWidth] = useState(0);
  /** Width over height, once the image is read: what a crop needs. */
  const [ratio, setRatio] = useState(0);
  const reducible = isMedia(src);

  useEffect(() => {
    const image = ref.current;
    if (!image || !reducible) return;
    const measure = () => {
      const density = window.devicePixelRatio || 1;
      let needed = image.clientWidth * density;
      // Cropped to a fixed height, a wide image is shown taller than its
      // width suggests: it takes the width that fills that height.
      if (fit === "cover" && height && ratio) needed = Math.max(needed, height * density * ratio);
      if (needed <= 0) return;
      const step = stepFor(Math.ceil(needed));
      setWidth((before) => Math.max(before, step));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(image);
    return () => observer.disconnect();
  }, [reducible, fit, height, ratio]);

  // Until measured, nothing is loaded: the original would be downloaded for nothing.
  const shown = !reducible ? src : width ? `${src}?w=${width}` : undefined;

  return (
    <img
      ref={ref}
      src={shown}
      alt={alt}
      decoding="async"
      draggable={false}
      onLoad={(e) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        if (naturalWidth && naturalHeight) setRatio(naturalWidth / naturalHeight);
      }}
      style={{
        display: "block",
        width: "100%",
        height: height || "auto",
        objectFit: fit,
        ...style,
      }}
    />
  );
}
