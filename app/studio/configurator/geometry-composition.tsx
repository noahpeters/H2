"use client";

import { useEffect, useRef } from "react";
import {
  type BaseSlug,
  type ChairSlug,
  type ShapeSlug,
} from "./catalog";

type Bounds = { x: number; y: number; width: number; height: number };

const GEOMETRIC_STAGE_SIZE = 600;

export function geometricStudySources(
  shape: ShapeSlug,
  base: BaseSlug,
  chair: ChairSlug,
  edgeColumn: number,
) {
  const edgeNames = shape === "rectangle"
    ? ["soft-square", "bullnose", "live-edge"]
    : shape === "oval"
      ? ["soft-square", "bullnose"]
      : ["soft-square", "bullnose"];
  const edge = edgeNames[edgeColumn] ?? "soft-square";
  const tableRoot = `/style-v2/tables/strips/${shape}`;
  const chairRoot = `/chairs/position-atlases/${shape}`;
  return {
    table: `${tableRoot}/${base}/table-${edge}.png?v=23`,
    back: chair === "none" ? null : `${chairRoot}/${chair}-back.png?v=20`,
    front: chair === "none" ? null : `${chairRoot}/${chair}-front.png?v=20`,
  };
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function drawCell(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: Bounds,
  target: Bounds,
  filter = "none",
) {
  context.save();
  context.filter = filter;
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    target.x,
    target.y,
    target.width,
    target.height,
  );
  context.restore();
}

export function GeometryComposition({
  shape,
  base,
  edgeColumn,
  row,
  chair,
  label,
}: {
  shape: ShapeSlug;
  base: BaseSlug;
  edgeColumn: number;
  row: number;
  length: number;
  width: number;
  diameter: number;
  chair: ChairSlug;
  label: string;
}) {
  const reference = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = reference.current;
    if (!canvas) return;
    let cancelled = false;
    const geometricSources = geometricStudySources(shape, base, chair, edgeColumn);
    const tableSource = geometricSources.table;
    const backSource = geometricSources.back;
    const frontSource = geometricSources.front;

    Promise.all([
      loadImage(tableSource),
      backSource ? loadImage(backSource) : Promise.resolve(null),
      frontSource ? loadImage(frontSource) : Promise.resolve(null),
    ]).then(([tableImage, backImage, frontImage]) => {
      if (cancelled) return;
      const rectangle = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rectangle.width * dpr);
      canvas.height = Math.round(rectangle.height * dpr);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(dpr, dpr);
      context.clearRect(0, 0, rectangle.width, rectangle.height);

      // Offline chair and table cells share one 600-unit stage. Keeping the
      // whole cell intact preserves the approved position, size, angle, and
      // layer without performing chair transforms in the browser.
      const side = Math.min(rectangle.width, rectangle.height);
      const stage = {
        x: (rectangle.width - side) / 2,
        y: (rectangle.height - side) / 2,
        width: side,
        height: side,
      };

      if (backImage) {
        drawCell(context, backImage, {
          x: 0,
          y: row * GEOMETRIC_STAGE_SIZE,
          width: backImage.naturalWidth,
          height: GEOMETRIC_STAGE_SIZE,
        }, stage);
      }

      drawCell(context, tableImage, {
        x: 0,
        y: row * GEOMETRIC_STAGE_SIZE,
        width: GEOMETRIC_STAGE_SIZE,
        height: GEOMETRIC_STAGE_SIZE,
      }, stage);

      if (frontImage) {
        drawCell(context, frontImage, {
          x: 0,
          y: row * GEOMETRIC_STAGE_SIZE,
          width: frontImage.naturalWidth,
          height: GEOMETRIC_STAGE_SIZE,
        }, stage);
      }
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [shape, base, edgeColumn, row, chair]);

  return <canvas ref={reference} className="geometry-composition" role="img" aria-label={label}/>;
}
