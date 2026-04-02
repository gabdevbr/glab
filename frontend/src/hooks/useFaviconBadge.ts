'use client';

import { useEffect, useRef } from 'react';

const FAVICON_SIZE = 32;
const BADGE_RADIUS = 8;

/**
 * Draws an unread count badge on the favicon.
 * When count is 0, restores the original favicon.
 */
export function useFaviconBadge(count: number) {
  const originalHref = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgLoaded = useRef(false);

  useEffect(() => {
    // Get or create the favicon link element
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    // Store the original href on first run
    if (originalHref.current === null) {
      originalHref.current = link.href || '/favicon-32x32.png';
    }

    // Create canvas once
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = FAVICON_SIZE;
      canvasRef.current.height = FAVICON_SIZE;
    }

    // No badge needed — restore original
    if (count <= 0) {
      link.href = originalHref.current;
      return;
    }

    const draw = () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);

      // Draw the original favicon
      if (imgRef.current && imgLoaded.current) {
        ctx.drawImage(imgRef.current, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
      }

      // Draw badge circle
      const badgeX = FAVICON_SIZE - BADGE_RADIUS;
      const badgeY = BADGE_RADIUS;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, BADGE_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      // Draw count text
      const label = count > 99 ? '99' : String(count);
      ctx.font = `bold ${label.length > 1 ? 9 : 11}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, badgeX, badgeY + 1);

      // Apply to favicon
      link!.href = canvas.toDataURL('image/png');
    };

    // Load image if not loaded yet
    if (!imgRef.current) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imgLoaded.current = true;
        draw();
      };
      img.src = originalHref.current;
      imgRef.current = img;
    } else if (imgLoaded.current) {
      draw();
    }
  }, [count]);
}
