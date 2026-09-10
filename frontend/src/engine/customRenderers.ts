import type { GraphNode, DisplayConfig } from '../types/graph';

// Cache for loaded HTML Image elements to avoid reloading during canvas ticks
const imageCache = new Map<string, HTMLImageElement>();

export function getOrLoadImage(url: string, onLoaded?: () => void): HTMLImageElement | null {
  if (imageCache.has(url)) {
    const img = imageCache.get(url)!;
    return img.complete ? img : null;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  imageCache.set(url, img);

  img.onload = () => {
    if (onLoaded) onLoaded();
  };
  return null;
}

export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  isSelected: boolean,
  isHovered: boolean,
  isDimmed: boolean,
  displayConfig: DisplayConfig,
  onImageLoad?: () => void
) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const baseRadius = (node.size || 20) * displayConfig.nodeScale;
  const alpha = isDimmed ? 0.2 : 1.0;

  ctx.save();
  ctx.globalAlpha = alpha;

  // 1. Halo Glow effect when selected or hovered
  if ((isSelected || isHovered) && displayConfig.haloGlow) {
    ctx.beginPath();
    ctx.arc(x, y, baseRadius + 10, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? 'rgba(99, 102, 241, 0.35)' : 'rgba(59, 130, 246, 0.25)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, baseRadius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = isSelected ? '#818cf8' : '#60a5fa';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 2. Render based on Node Type
  switch (node.type) {
    case 'image':
      drawImageNode(ctx, node, x, y, baseRadius, isSelected, onImageLoad);
      break;

    case 'task':
      drawTaskNode(ctx, node, x, y, baseRadius, isSelected);
      break;

    case 'code':
      drawCodeNode(ctx, node, x, y, baseRadius, isSelected);
      break;

    case 'entity':
      drawEntityNode(ctx, node, x, y, baseRadius, isSelected);
      break;

    case 'document':
    case 'custom':
    default:
      drawStandardNode(ctx, node, x, y, baseRadius, isSelected);
      break;
  }

  // 3. Render Title Label if enabled
  if (displayConfig.showLabels) {
    drawNodeLabel(ctx, node, x, y, baseRadius, displayConfig.labelSize, isSelected || isHovered);
  }

  ctx.restore();
}

function drawStandardNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  x: number,
  y: number,
  r: number,
  isSelected: boolean
) {
  const color = node.color || '#3b82f6';

  // Fill gradient
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grad.addColorStop(0, adjustColor(color, 40));
  grad.addColorStop(1, color);

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = isSelected ? '#ffffff' : adjustColor(color, -30);
  ctx.lineWidth = isSelected ? 3 : 1.5;
  ctx.stroke();
}

function drawImageNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  x: number,
  y: number,
  r: number,
  isSelected: boolean,
  onImageLoad?: () => void
) {
  const imageUrl = node.metadata?.imageUrl;
  const loadedImg = imageUrl ? getOrLoadImage(imageUrl, onImageLoad) : null;
  const color = node.color || '#0ea5e9';

  if (loadedImg && loadedImg.complete && loadedImg.naturalWidth > 0) {
    // Background frame
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(loadedImg, x - r, y - r, r * 2, r * 2);
    ctx.restore();

    // Border ring
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = isSelected ? '#ffffff' : color;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.stroke();
  } else {
    // When image is not present or removed, render pure Obsidian circular node
    drawStandardNode(ctx, node, x, y, r, isSelected);
  }
}

function drawTaskNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  x: number,
  y: number,
  r: number,
  isSelected: boolean
) {
  const tasks = node.metadata?.tasks || [];
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const ratio = total > 0 ? completed / total : 0;

  // Background node
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#064e3b';
  ctx.fill();

  // Outer Progress Ring (Track)
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Progress Arc
  if (ratio > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + ratio * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, startAngle, endAngle);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Inner Checkmark & Percentage
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.max(9, r * 0.65)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  if (total > 0) {
    ctx.fillText(`${completed}/${total}`, x, y);
  } else {
    ctx.fillText('☑️', x, y);
  }

  // Border ring
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = isSelected ? '#ffffff' : '#059669';
  ctx.lineWidth = isSelected ? 3 : 1.5;
  ctx.stroke();
}

function drawCodeNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  x: number,
  y: number,
  r: number,
  isSelected: boolean
) {
  const lang = (node.metadata?.language || 'code').toUpperCase().slice(0, 3);

  // Dark IDE-like hex/box background
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1e1b4b';
  ctx.fill();

  // Code language badge
  ctx.fillStyle = '#f59e0b';
  ctx.font = `bold ${Math.max(8, r * 0.55)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`{${lang}}`, x, y);

  // Border ring
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = isSelected ? '#ffffff' : '#f59e0b';
  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.stroke();
}

function drawEntityNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  x: number,
  y: number,
  r: number,
  isSelected: boolean
) {
  const fieldCount = node.metadata?.schemaFields?.length || 0;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#4c1d95';
  ctx.fill();

  // Multi-layer gear/entity feel
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = '#6d28d9';
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.max(9, r * 0.6)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fieldCount > 0 ? `⚡${fieldCount}` : '⚡', x, y);

  // Outer border
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = isSelected ? '#ffffff' : '#a855f7';
  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.stroke();
}

function drawNodeLabel(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  x: number,
  y: number,
  r: number,
  fontSize: number,
  isHighlighted: boolean
) {
  const text = node.label;
  if (!text) return;

  ctx.font = `${isHighlighted ? '600' : '400'} ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const labelY = y + r + 6;
  const paddingX = 6;
  const paddingY = 2;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;

  // Background pill for label
  ctx.fillStyle = isHighlighted ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  ctx.roundRect(
    x - textWidth / 2 - paddingX,
    labelY - paddingY,
    textWidth + paddingX * 2,
    fontSize + paddingY * 2,
    4
  );
  ctx.fill();

  if (isHighlighted) {
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Label text
  ctx.fillStyle = isHighlighted ? '#ffffff' : '#cbd5e1';
  ctx.fillText(text, x, labelY);
}

// Utility function to lighten/darken hex colors
function adjustColor(color: string, amount: number): string {
  let hex = color.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  if (isNaN(num)) return color;

  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
