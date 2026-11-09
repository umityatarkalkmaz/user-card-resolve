// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Ümit Yatarkalkmaz

const COLUMN_NAME = "Üye";
const COLUMN_LEVEL = "Şu anki seviye";
const COLUMN_MONTHS = "Üyeliğin devam ettiği toplam ay sayısı";
const COLUMN_PRICE = "Fiyat";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MEMBERS = 5000;
const MAX_TEXT_LENGTH = 60;

const FRAME_ASPECT = 16 / 9;
const LINE_SPACING = 1.3;
const FUSION_LINE_SPACING = 1.13;
const AVERAGE_CHAR_WIDTH = 0.55;
const PANEL_WIDTH = 0.92;
const PANEL_TOP = 0.05;
const PANEL_BOTTOM = 0.95;
const COLUMN_GAP = 0.02;
const TITLE_GAP = 0.025;
const HEADER_GAP = 0.012;
const TITLE_SIZE = 0.055;
const MIN_TITLE_SIZE = 0.03;
const LEVEL_SIZE = 0.03;
const MIN_LEVEL_SIZE = 0.016;
const NAME_SIZE = 0.026;
const MIN_NAME_SIZE = 0.014;
const PACK_SEPARATOR = " | ";
const ELLIPSIS = "\u2026";
const READABLE_NAMES_PER_SECOND = 3;
const MAX_SIDE_COLUMN_SHARE = 0.25;
const MIN_SECONDS = 3;
const FIT_EPSILON = 1e-9;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export const DEFAULT_COLORS = Object.freeze({ title: "#ffffff", name: "#ffffff", level: "#ffcc40" });

export function cleanText(value) {
  const withoutControls = String(value ?? "")
    .normalize("NFC")
    .replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, " ");
  const compact = withoutControls.split(/\s+/u).filter(Boolean).join(" ");
  return Array.from(compact).slice(0, MAX_TEXT_LENGTH).join("");
}

export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let isQuoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (isQuoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        isQuoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      isQuoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      rows.push([...row, field.replace(/\r$/, "")]);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (isQuoted) throw new Error("CSV bozuk: kapanmamış tırnak var.");
  if (field || row.length) rows.push([...row, field.replace(/\r$/, "")]);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function parsePrice(value) {
  const digits = String(value ?? "").replace(/[^\d,.]/g, "");
  const price = Number(digits.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(price) ? price : 0;
}

function parseMonths(value) {
  const months = Math.floor(Number(String(value ?? "").replace(",", ".")));
  return Number.isFinite(months) && months >= 0 ? months : null;
}

function findColumnIndex(headers, columnName) {
  const index = headers.findIndex((header) => header.trim().normalize("NFC") === columnName);
  if (index === -1) throw new Error(`CSV'de "${columnName}" sütunu yok.`);
  return index;
}

export function buildGroups(csvText) {
  const [headers, ...rows] = parseCsvRows(csvText);
  if (!headers) throw new Error("CSV boş.");

  const nameIndex = findColumnIndex(headers, COLUMN_NAME);
  const levelIndex = findColumnIndex(headers, COLUMN_LEVEL);
  const monthsIndex = findColumnIndex(headers, COLUMN_MONTHS);
  const priceIndex = findColumnIndex(headers, COLUMN_PRICE);

  const groups = new Map();
  for (const cells of rows) {
    const name = cleanText(cells[nameIndex]);
    const level = cleanText(cells[levelIndex]);
    if (!name || !level) continue;
    if (!groups.has(level)) groups.set(level, { level, price: 0, members: new Map() });
    const group = groups.get(level);
    group.price = Math.max(group.price, parsePrice(cells[priceIndex]));
    group.members.set(name, { name, months: parseMonths(cells[monthsIndex]) });
  }

  const sorted = [...groups.values()]
    .sort((a, b) => b.price - a.price || a.level.localeCompare(b.level, "tr"))
    .map(({ level, members }) => ({
      level,
      members: [...members.values()].sort(
        (a, b) => (b.months ?? -1) - (a.months ?? -1) || a.name.localeCompare(b.name, "tr"),
      ),
    }));

  const total = sorted.reduce((sum, group) => sum + group.members.length, 0);
  if (!total) throw new Error("CSV'de üye bulunamadı.");
  return sorted;
}

export function formatMemberLabel({ name, months }) {
  return months === null ? name : `${name} · ${months} ay`;
}

export function formatPlainText(groups) {
  return `${groups
    .map(({ level, members }) => [level, ...members.map(formatMemberLabel)].join("\n"))
    .join("\n\n")}\n`;
}

export function normalizeHexColor(value) {
  const color = String(value ?? "").trim().toLowerCase();
  if (!HEX_COLOR_PATTERN.test(color)) throw new Error("Renk #rrggbb biçiminde olmalı.");
  return color;
}

export function isHexColor(value) {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.toLowerCase());
}

function convertHexToUnit(value) {
  const color = normalizeHexColor(value);
  return [1, 3, 5].map((offset) => Number((parseInt(color.slice(offset, offset + 2), 16) / 255).toFixed(4)));
}

function countChars(text) {
  return Array.from(text).length;
}

function getCharWidth(size) {
  return size * AVERAGE_CHAR_WIDTH;
}

function getLineHeight(size) {
  return size * FRAME_ASPECT * LINE_SPACING;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getFittingChars(width, size) {
  return Math.max(1, Math.floor(width / getCharWidth(size) + FIT_EPSILON));
}

function truncateText(text, maxChars) {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  if (maxChars <= 1) return ELLIPSIS;
  return `${chars.slice(0, maxChars - 1).join("").trimEnd()}${ELLIPSIS}`;
}

function truncateMemberLabel(member, maxChars) {
  const label = formatMemberLabel(member);
  if (countChars(label) <= maxChars || member.months === null) return truncateText(label, maxChars);
  const suffix = ` · ${member.months} ay`;
  const nameChars = maxChars - countChars(suffix);
  if (nameChars < 2) return truncateText(label, maxChars);
  return `${truncateText(member.name, nameChars)}${suffix}`;
}

function fitSingleLine(text, width, baseSize, minSize) {
  const naturalWidth = countChars(text) * getCharWidth(baseSize);
  const size = naturalWidth > width ? clamp((baseSize * width) / naturalWidth, minSize, baseSize) : baseSize;
  return { text: truncateText(text, getFittingChars(width, size)), size };
}

function packLabels(labels, maxChars) {
  const separatorChars = countChars(PACK_SEPARATOR);
  const lines = [];
  let line = [];
  let lineChars = 0;
  for (const label of labels) {
    const labelChars = countChars(label);
    if (line.length && lineChars + separatorChars + labelChars > maxChars) {
      lines.push(line.join(PACK_SEPARATOR));
      line = [];
      lineChars = 0;
    }
    lineChars += (line.length ? separatorChars : 0) + labelChars;
    line.push(label);
  }
  if (line.length) lines.push(line.join(PACK_SEPARATOR));
  return lines;
}

function findLargestIndex(groups) {
  return groups.reduce((best, group, index) => (group.members.length > groups[best].members.length ? index : best), 0);
}

function allocateWidths(desired, largestIndex, available) {
  const othersTotal = desired.reduce((sum, width, index) => (index === largestIndex ? sum : sum + width), 0);
  if (othersTotal + desired[largestIndex] <= available) {
    return desired.map((width, index) => (index === largestIndex ? available - othersTotal : width));
  }
  let remaining = available;
  let count = desired.length;
  let cap = available / desired.length;
  for (const width of [...desired].sort((a, b) => a - b)) {
    if (width * count > remaining) {
      cap = remaining / count;
      break;
    }
    remaining -= width;
    count -= 1;
  }
  return desired.map((width) => Math.min(width, cap));
}

function resolveLevelColors(colors, level) {
  const custom = colors.levels?.get?.(level) ?? {};
  return {
    level: normalizeHexColor(custom.level ?? DEFAULT_COLORS.level),
    name: normalizeHexColor(custom.name ?? colors.name ?? DEFAULT_COLORS.name),
  };
}

function buildColumn(group, width, areaHeight, isLargest) {
  const naturalChars = Math.max(...group.members.map((member) => countChars(formatMemberLabel(member))));
  const naturalWidth = naturalChars * getCharWidth(NAME_SIZE);
  const size = naturalWidth > width ? clamp((NAME_SIZE * width) / naturalWidth, MIN_NAME_SIZE, NAME_SIZE) : NAME_SIZE;
  const maxChars = getFittingChars(width, size);
  const labels = group.members.map((member) => truncateMemberLabel(member, maxChars));
  const lineHeight = getLineHeight(size);
  const lines = isLargest && labels.length * lineHeight > areaHeight + FIT_EPSILON ? packLabels(labels, maxChars) : labels;
  const lineLabelCounts = lines.map((line) => (lines === labels ? 1 : line.split(PACK_SEPARATOR).length));
  return { text: lines.join("\n"), size, lineHeight, height: lines.length * lineHeight, lineLabelCounts };
}

export function computeLayout(groups, { title = "", colors = {} } = {}) {
  const total = groups.reduce((sum, group) => sum + group.members.length, 0);
  if (total > MAX_MEMBERS) throw new Error(`En fazla ${MAX_MEMBERS} üye desteklenir; bu listede ${total} var.`);
  if (!groups.length) throw new Error("Seviye bulunamadı.");

  const titleColor = normalizeHexColor(colors.title ?? DEFAULT_COLORS.title);
  const items = [];
  let cursor = PANEL_TOP;

  const safeTitle = cleanText(title);
  if (safeTitle) {
    const fitted = fitSingleLine(safeTitle, PANEL_WIDTH, TITLE_SIZE, MIN_TITLE_SIZE);
    const height = getLineHeight(TITLE_SIZE);
    items.push({ kind: "title", ...fitted, x: 0.5, y: cursor + height / 2, color: titleColor });
    cursor += height + TITLE_GAP;
  }

  const headerHeight = getLineHeight(LEVEL_SIZE);
  const headerY = cursor + headerHeight / 2;
  const namesTop = cursor + headerHeight + HEADER_GAP;
  const areaHeight = PANEL_BOTTOM - namesTop;

  const available = PANEL_WIDTH - COLUMN_GAP * (groups.length - 1);
  const largestIndex = findLargestIndex(groups);
  const sideColumnCap = PANEL_WIDTH * MAX_SIDE_COLUMN_SHARE;
  const desired = groups.map((group, index) => {
    const levelWidth = countChars(group.level) * getCharWidth(LEVEL_SIZE);
    const nameChars = Math.max(...group.members.map((member) => countChars(formatMemberLabel(member))));
    const width = Math.max(levelWidth, nameChars * getCharWidth(NAME_SIZE));
    return index === largestIndex ? width : Math.min(width, sideColumnCap);
  });
  const widths = allocateWidths(desired, largestIndex, available);

  let left = (1 - PANEL_WIDTH) / 2;
  const columns = groups.map((group, index) => {
    const width = widths[index];
    const x = left + width / 2;
    left += width + COLUMN_GAP;
    const levelColors = resolveLevelColors(colors, group.level);
    const header = fitSingleLine(group.level, width, LEVEL_SIZE, MIN_LEVEL_SIZE);
    const body = buildColumn(group, width, areaHeight, index === largestIndex);
    return { x, width, header, body, levelColors };
  });

  const isAnyScrolling = columns.some(({ body }) => body.height > areaHeight + FIT_EPSILON);
  const usedHeight = Math.max(...columns.map(({ body }) => body.height));
  const shift = isAnyScrolling ? 0 : (areaHeight - usedHeight) / 2;
  for (const item of items) item.y += shift;

  let maxTravelLines = 0;
  let scrollingCount = 0;
  const revealRates = [];
  for (const { x, width, header, body, levelColors } of columns) {
    items.push({ kind: "level", ...header, x, y: headerY + shift, color: levelColors.level });
    const isScrolling = body.height > areaHeight + FIT_EPSILON;
    const names = {
      kind: "names",
      text: body.text,
      size: body.size,
      x,
      y: namesTop + shift + body.height / 2,
      color: levelColors.name,
      scroll: null,
    };
    if (isScrolling) {
      const travel = body.height - areaHeight;
      names.scroll = {
        travel,
        lineHeight: body.lineHeight,
        clip: { x: x - width / 2, y: namesTop, width, height: areaHeight },
      };
      const travelLines = travel / body.lineHeight;
      const visibleLines = Math.floor(areaHeight / body.lineHeight + FIT_EPSILON);
      const revealedLines = body.lineLabelCounts.slice(visibleLines);
      const revealedNames = revealedLines.reduce((sum, count) => sum + count, 0);
      revealRates.push(revealedNames / Math.max(1, revealedLines.length));
      maxTravelLines = Math.max(maxTravelLines, travelLines);
      scrollingCount += 1;
    }
    items.push(names);
  }

  // All scrolling columns share one line rate, so the column revealing the most names per line sets the pace.
  const minSeconds = scrollingCount
    ? Math.max(MIN_SECONDS, Math.ceil((maxTravelLines * Math.max(...revealRates)) / READABLE_NAMES_PER_SECOND))
    : null;
  return { items, maxTravelLines, scrollingCount, minSeconds };
}

export function getOutputNodeName({ items }) {
  return items.length > 1 ? `Merge${items.length}` : "Text1";
}

export function encodeLuaString(value) {
  let encoded = '"';
  for (const byte of new TextEncoder().encode(String(value))) {
    if (byte === 0x22) encoded += '\\"';
    else if (byte === 0x5c) encoded += "\\\\";
    else if (byte >= 0x20 && byte < 0x7f) encoded += String.fromCharCode(byte);
    else encoded += `\\${String(byte).padStart(3, "0")}`;
  }
  return `${encoded}"`;
}

function formatNumber(value, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Geçersiz sayısal değer.");
  const fixed = value.toFixed(digits);
  const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}

function buildCenterInput(item, rate) {
  const centerX = formatNumber(item.x);
  const startY = formatNumber(1 - item.y, 6);
  if (!item.scroll) return `Center = Input { Value = { ${centerX}, ${startY} }, },`;
  const step = formatNumber(rate * item.scroll.lineHeight, 10);
  const travel = formatNumber(item.scroll.travel, 6);
  const expression = `Point(${centerX}, ${startY} + min(time * ${step}, ${travel}))`;
  return `Center = Input { Value = { ${centerX}, ${startY} }, Expression = ${encodeLuaString(expression)}, },`;
}

function buildTextTool(id, item, { font, lastFrame, rate, maskName }) {
  const [red, green, blue] = convertHexToUnit(item.color);
  const maskInput = maskName
    ? `\n\t\t\t\tEffectMask = Input { SourceOp = ${encodeLuaString(maskName)}, Source = "Mask", },`
    : "";
  return `\t\tText${id} = TextPlus {
\t\t\tInputs = {
\t\t\t\tGlobalOut = Input { Value = ${lastFrame}, },
\t\t\t\tWidth = Input { Value = 1920, },
\t\t\t\tHeight = Input { Value = 1080, },
\t\t\t\tUseFrameFormatSettings = Input { Value = 1, },
\t\t\t\tStyledText = Input { Value = ${encodeLuaString(item.text)}, },
\t\t\t\tFont = Input { Value = ${encodeLuaString(font)}, },
\t\t\t\tStyle = Input { Value = "Bold", },
\t\t\t\tSize = Input { Value = ${formatNumber(item.size)}, },
\t\t\t\tLineSpacing = Input { Value = ${FUSION_LINE_SPACING}, },
\t\t\t\t${buildCenterInput(item, rate)}
\t\t\t\tRed1 = Input { Value = ${formatNumber(red)}, },
\t\t\t\tGreen1 = Input { Value = ${formatNumber(green)}, },
\t\t\t\tBlue1 = Input { Value = ${formatNumber(blue)}, },${maskInput}
\t\t\t},
\t\t\tViewInfo = OperatorInfo { Pos = { ${id * 110}, 16.5 } },
\t\t},`;
}

function buildMaskTool(name, id, clip, lastFrame) {
  const centerX = formatNumber(clip.x + clip.width / 2, 6);
  const centerY = formatNumber(1 - (clip.y + clip.height / 2), 6);
  return `\t\t${name} = RectangleMask {
\t\t\tInputs = {
\t\t\t\tGlobalOut = Input { Value = ${lastFrame}, },
\t\t\t\tMaskWidth = Input { Value = 1920, },
\t\t\t\tMaskHeight = Input { Value = 1080, },
\t\t\t\tPixelAspect = Input { Value = { 1, 1 }, },
\t\t\t\tUseFrameFormatSettings = Input { Value = 1, },
\t\t\t\tCenter = Input { Value = { ${centerX}, ${centerY} }, },
\t\t\t\tWidth = Input { Value = ${formatNumber(clip.width, 6)}, },
\t\t\t\tHeight = Input { Value = ${formatNumber(clip.height / FRAME_ASPECT, 6)}, },
\t\t\t},
\t\t\tViewInfo = OperatorInfo { Pos = { ${id * 110}, -49.5 } },
\t\t},`;
}

function buildMergeTool(id, backgroundName) {
  return `\t\tMerge${id} = Merge {
\t\t\tInputs = {
\t\t\t\tBackground = Input { SourceOp = ${encodeLuaString(backgroundName)}, Source = "Output", },
\t\t\t\tForeground = Input { SourceOp = "Text${id}", Source = "Output", },
\t\t\t\tPerformDepthMerge = Input { Value = 0, },
\t\t\t},
\t\t\tViewInfo = OperatorInfo { Pos = { ${id * 110}, 82.5 } },
\t\t},`;
}

export function validateTiming(seconds, framesPerSecond) {
  const duration = Number(seconds);
  const fps = Number(framesPerSecond);
  if (!Number.isFinite(duration) || duration < 3 || duration > 3600) {
    throw new Error("Süre 3-3600 saniye arasında olmalı.");
  }
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) {
    throw new Error("FPS 1-120 arasında tam sayı olmalı.");
  }
  return { totalFrames: Math.round(duration * fps) };
}

export function generateSetting(layout, { font, seconds, framesPerSecond }) {
  const safeFont = cleanText(font);
  if (!safeFont) throw new Error("Font adı boş olamaz.");

  const { totalFrames } = validateTiming(seconds, framesPerSecond);
  const lastFrame = totalFrames - 1;
  const rate = layout.maxTravelLines / lastFrame;
  const tools = [];
  let backgroundName = "Text1";
  layout.items.forEach((item, index) => {
    const id = index + 1;
    const maskName = item.scroll ? `Mask${id}` : null;
    if (maskName) tools.push(buildMaskTool(maskName, id, item.scroll.clip, lastFrame));
    tools.push(buildTextTool(id, item, { font: safeFont, lastFrame, rate, maskName }));
    if (id > 1) {
      tools.push(buildMergeTool(id, backgroundName));
      backgroundName = `Merge${id}`;
    }
  });

  return `{\n\tTools = ordered() {\n${tools.join("\n")}\n\t},\n\tActiveTool = ${encodeLuaString(backgroundName)}\n}\n`;
}
