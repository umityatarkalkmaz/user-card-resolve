const COLUMN_NAME = "Üye";
const COLUMN_LEVEL = "Şu anki seviye";
const COLUMN_MONTHS = "Üyeliğin devam ettiği toplam ay sayısı";
const COLUMN_PRICE = "Fiyat";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MEMBERS = 60;
const MAX_TEXT_LENGTH = 60;
const POP_FRAMES = 10;
const MAX_STAGGER_FRAMES = 4;
const FADE_OUT_FRAMES = 15;
const FRAME_ASPECT = 16 / 9;
const LINE_SPACING = 1.3;
const USABLE_HEIGHT = 0.88;
const USABLE_WIDTH = 0.9;
const AVERAGE_CHAR_WIDTH = 0.55;

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

function arrangeGroups(groups, title, scale) {
  const titleSize = 0.07 * scale;
  const levelSize = 0.042 * scale;
  const items = [];
  let cursor = 0;

  if (title) {
    items.push({ kind: "title", text: title, x: 0.5, y: cursor + getLineHeight(titleSize) / 2, size: titleSize });
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
    const rowCount = Math.ceil(labels.length / columns);
    labels.forEach((label, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const inRow = row === rowCount - 1 && labels.length % columns ? labels.length % columns : columns;
      const cellWidth = USABLE_WIDTH / columns;
      items.push({
        kind: "member",
        text: label,
        x: 0.5 + (column - (inRow - 1) / 2) * cellWidth,
        y: cursor + row * rowHeight + rowHeight / 2,
        size: memberSize,
      });
    });
    cursor += rowCount * rowHeight;
  }

  if (cursor > USABLE_HEIGHT) return null;
  const offset = (1 - cursor) / 2;
  return items.map((item) => ({ ...item, y: item.y + offset }));
}

export function computeLayout(groups, title) {
  const total = groups.reduce((sum, group) => sum + group.members.length, 0);
  if (total > MAX_MEMBERS) {
    throw new Error(`Kart en fazla ${MAX_MEMBERS} üye alır; bu listede ${total} var. Düz metni Scroll'a yapıştır.`);
  }
  for (let scale = 1; scale >= 0.4; scale -= 0.05) {
    const items = arrangeGroups(groups, cleanText(title), scale);
    if (items) return items;
  }
  throw new Error("Üyeler karta sığmıyor. Düz metni Scroll'a yapıştır.");
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

function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
}

function buildSpline(name, keys) {
  const frames = keys
    .map(([frame, value], index) => {
      const handles = [];
      const previous = keys[index - 1];
      const next = keys[index + 1];
      if (previous) {
        handles.push(`LH = { ${formatNumber(frame - (frame - previous[0]) / 3)}, ${formatNumber(value + (previous[1] - value) / 3)} }`);
      }
      if (next) {
        handles.push(`RH = { ${formatNumber(frame + (next[0] - frame) / 3)}, ${formatNumber(value + (next[1] - value) / 3)} }`);
      }
      return `\t\t\t\t[${frame}] = { ${formatNumber(value)}, ${handles.join(", ")}, Flags = { Linear = true } },`;
    })
    .join("\n");
  return `\t\t${name} = BezierSpline {\n\t\t\tSplineColor = { Red = 255, Green = 128, Blue = 0 },\n\t\t\tNameSet = true,\n\t\t\tKeyFrames = {\n${frames}\n\t\t\t}\n\t\t},`;
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
\t\t\t\tRed1 = Input { Value = ${color[0]}, },
\t\t\t\tGreen1 = Input { Value = ${color[1]}, },
\t\t\t\tBlue1 = Input { Value = ${color[2]}, },
\t\t\t},
\t\t\tViewInfo = OperatorInfo { Pos = { ${id * 110}, 16.5 } },
\t\t},`;
}

function buildMergeTool(id, item, backgroundName) {
  return `\t\tMerge${id} = Merge {
\t\t\tInputs = {
\t\t\t\tBlend = Input { SourceOp = "Merge${id}Blend", Source = "Value", },
\t\t\t\tBackground = Input { SourceOp = "${backgroundName}", Source = "Output", },
\t\t\t\tForeground = Input { SourceOp = "Text${id}", Source = "Output", },
\t\t\t\tCenter = Input { Value = { ${formatNumber(item.x)}, ${formatNumber(1 - item.y)} }, },
\t\t\t\tSize = Input { SourceOp = "Merge${id}Size", Source = "Value", },
\t\t\t\tPerformDepthMerge = Input { Value = 0, },
\t\t\t},
\t\t\tViewInfo = OperatorInfo { Pos = { ${id * 110}, 82.5 } },
\t\t},`;
}

function buildBackgroundTool(lastFrame) {
  return `\t\tMembersBackground = Background {
\t\t\tInputs = {
\t\t\t\tGlobalOut = Input { Value = ${lastFrame}, },
\t\t\t\tWidth = Input { Value = 1920, },
\t\t\t\tHeight = Input { Value = 1080, },
\t\t\t\tUseFrameFormatSettings = Input { Value = 1, },
\t\t\t\tTopLeftRed = Input { Value = 0, },
\t\t\t\tTopLeftGreen = Input { Value = 0, },
\t\t\t\tTopLeftBlue = Input { Value = 0, },
\t\t\t\tTopLeftAlpha = Input { Value = 0, },
\t\t\t},
\t\t\tViewInfo = OperatorInfo { Pos = { 0, 82.5 } },
\t\t},`;
}

export function validateTiming(seconds, framesPerSecond) {
  const duration = Number(seconds);
  const fps = Number(framesPerSecond);
  if (!Number.isFinite(duration) || duration < 3 || duration > 60) {
    throw new Error("Süre 3-60 saniye arasında olmalı.");
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
  const fadeStart = lastFrame - FADE_OUT_FRAMES;
  const available = fadeStart - POP_FRAMES;
  const stagger = Math.min(MAX_STAGGER_FRAMES, Math.floor(available / Math.max(items.length - 1, 1)));
  if (stagger < 1) throw new Error("Bu kadar üye için süre kısa; süreyi artır.");

  const tools = [buildBackgroundTool(lastFrame)];
  let backgroundName = "MembersBackground";
  items.forEach((item, index) => {
    const id = index + 1;
    const start = index * stagger;
    tools.push(buildTextTool(id, item, safeFont, lastFrame));
    tools.push(buildMergeTool(id, item, backgroundName));
    tools.push(buildSpline(`Merge${id}Blend`, [[start, 0], [start + 3, 1], [fadeStart, 1], [lastFrame, 0]]));
    tools.push(buildSpline(`Merge${id}Size`, [[start, 0.6], [start + 6, 1.12], [start + POP_FRAMES, 1]]));
    backgroundName = `Merge${id}`;
  });

  return `{\n\tTools = ordered() {\n${tools.join("\n")}\n\t},\n\tActiveTool = "${backgroundName}"\n}\n`;
}
