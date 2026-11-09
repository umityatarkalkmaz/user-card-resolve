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
const USABLE_HEIGHT = 0.88;
const USABLE_WIDTH = 0.9;
const AVERAGE_CHAR_WIDTH = 0.55;
const MIN_CARD_SCALE_PERCENT = 60;
const SCROLL_TEXT_SIZE = 0.04;
const READABLE_SCROLL_SPEED = 0.2;

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

function estimateTextWidth(text, size) {
  return Array.from(text).length * size * AVERAGE_CHAR_WIDTH;
}

function getLineHeight(size) {
  return size * FRAME_ASPECT * LINE_SPACING;
}

function arrangeCard(groups, title, scale) {
  const titleSize = 0.07 * scale;
  const levelSize = 0.042 * scale;
  const items = [];
  let cursor = 0;

  if (title) {
    items.push({ kind: "title", text: title, x: 0.5, y: getLineHeight(titleSize) / 2, size: titleSize });
    cursor += getLineHeight(titleSize);
  }

  for (const [groupIndex, group] of groups.entries()) {
    const memberSize = (groupIndex === 0 && groups.length > 1 ? 0.05 : 0.04) * scale;
    const labels = group.members.map(formatMemberLabel);
    const widest = Math.max(...labels.map((label) => estimateTextWidth(label, memberSize)));
    const fittingColumns = Math.floor(USABLE_WIDTH / (widest + 0.03));
    if (fittingColumns < 1 || estimateTextWidth(group.level, levelSize) > USABLE_WIDTH) return null;
    const columns = Math.min(fittingColumns, Math.ceil(Math.sqrt(labels.length)));

    cursor += 0.03 * scale;
    items.push({ kind: "level", text: group.level, x: 0.5, y: cursor + getLineHeight(levelSize) / 2, size: levelSize });
    cursor += getLineHeight(levelSize);

    const rowHeight = getLineHeight(memberSize);
    const cellWidth = USABLE_WIDTH / columns;
    for (let column = 0; column < columns; column += 1) {
      const lines = labels.filter((_, index) => index % columns === column);
      items.push({
        kind: "names",
        text: lines.join("\n"),
        x: 0.5 + (column - (columns - 1) / 2) * cellWidth,
        y: cursor + (lines.length * rowHeight) / 2,
        size: memberSize,
      });
    }
    cursor += Math.ceil(labels.length / columns) * rowHeight;
  }

  if (cursor > USABLE_HEIGHT) return null;
  const offset = (1 - cursor) / 2;
  return items.map((item) => ({ ...item, y: item.y + offset }));
}

function arrangeScroll(groups, title) {
  const sections = groups.map(({ level, members }) => [level, ...members.map(formatMemberLabel)].join("\n"));
  const text = [title, ...sections].filter(Boolean).join("\n\n");
  const height = text.split("\n").length * getLineHeight(SCROLL_TEXT_SIZE);
  return [{ kind: "scroll", text, x: 0.5, y: 0.05 + height / 2, size: SCROLL_TEXT_SIZE, height }];
}

export function computeLayout(groups, title) {
  const total = groups.reduce((sum, group) => sum + group.members.length, 0);
  if (total > MAX_MEMBERS) throw new Error(`En fazla ${MAX_MEMBERS} üye desteklenir; bu listede ${total} var.`);

  const safeTitle = cleanText(title);
  for (let percent = 100; percent >= MIN_CARD_SCALE_PERCENT; percent -= 5) {
    const items = arrangeCard(groups, safeTitle, percent / 100);
    if (items) return items;
  }
  return arrangeScroll(groups, safeTitle);
}

export function isScrollLayout(items) {
  return items[0]?.kind === "scroll";
}

export function computeMinScrollSeconds([item]) {
  return Math.ceil((1 + item.height) / READABLE_SCROLL_SPEED);
}

export function getOutputNodeName(items) {
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
  return Number(value.toFixed(digits)).toString();
}

function buildCenterInput(item, lastFrame) {
  if (item.kind !== "scroll") {
    return `Center = Input { Value = { ${formatNumber(item.x)}, ${formatNumber(1 - item.y)} }, },`;
  }
  const startY = -item.height / 2;
  const step = (1 + item.height) / lastFrame;
  const expression = `Point(0.5, ${formatNumber(startY, 6)} + time * ${formatNumber(step, 8)})`;
  return `Center = Input { Value = { 0.5, ${formatNumber(startY, 6)} }, Expression = ${encodeLuaString(expression)}, },`;
}

function buildTextTool(id, item, font, lastFrame) {
  const color = item.kind === "level" ? [1, 0.8, 0.25] : [1, 1, 1];
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
\t\t\t\t${buildCenterInput(item, lastFrame)}
\t\t\t\tRed1 = Input { Value = ${color[0]}, },
\t\t\t\tGreen1 = Input { Value = ${color[1]}, },
\t\t\t\tBlue1 = Input { Value = ${color[2]}, },
\t\t\t},
\t\t\tViewInfo = OperatorInfo { Pos = { ${id * 110}, 16.5 } },
\t\t},`;
}

function buildMergeTool(id, backgroundName) {
  return `\t\tMerge${id} = Merge {
\t\t\tInputs = {
\t\t\t\tBackground = Input { SourceOp = "${backgroundName}", Source = "Output", },
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

export function generateSetting(items, { font, seconds, framesPerSecond }) {
  const safeFont = cleanText(font);
  if (!safeFont) throw new Error("Font adı boş olamaz.");

  const { totalFrames } = validateTiming(seconds, framesPerSecond);
  const lastFrame = totalFrames - 1;
  const tools = [];
  let backgroundName = "Text1";
  items.forEach((item, index) => {
    const id = index + 1;
    tools.push(buildTextTool(id, item, safeFont, lastFrame));
    if (id > 1) {
      tools.push(buildMergeTool(id, backgroundName));
      backgroundName = `Merge${id}`;
    }
  });

  return `{\n\tTools = ordered() {\n${tools.join("\n")}\n\t},\n\tActiveTool = "${backgroundName}"\n}\n`;
}
