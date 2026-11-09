// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Ümit Yatarkalkmaz

import {
  DEFAULT_COLORS,
  MAX_FILE_BYTES,
  buildGroups,
  cleanText,
  computeLayout,
  formatPlainText,
  generateSetting,
  getOutputNodeName,
  isHexColor,
} from "./core.js";

const STORAGE_KEY = "uye-karti.colors.v1";
const MAX_STORED_LEVELS = 100;

const elements = {
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  title: document.querySelector("#title-input"),
  font: document.querySelector("#font-input"),
  seconds: document.querySelector("#seconds-input"),
  fps: document.querySelector("#fps-input"),
  titleColor: document.querySelector("#title-color-input"),
  nameColor: document.querySelector("#name-color-input"),
  resetColors: document.querySelector("#reset-colors"),
  levelColors: document.querySelector("#level-colors"),
  status: document.querySelector("#status"),
  preview: document.querySelector("#preview"),
  downloadSetting: document.querySelector("#download-setting"),
  downloadText: document.querySelector("#download-text"),
};

let groups = null;
let settingOutput = null;
const colorSettings = readStoredColors();

function pickColor(value, fallback) {
  return isHexColor(value) ? value.toLowerCase() : fallback;
}

function readStoredColors() {
  const settings = { title: DEFAULT_COLORS.title, name: DEFAULT_COLORS.name, levels: new Map() };
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return settings;
    settings.title = pickColor(stored.title, settings.title);
    settings.name = pickColor(stored.name, settings.name);
    if (Array.isArray(stored.levels)) {
      for (const entry of stored.levels.slice(-MAX_STORED_LEVELS)) {
        if (!Array.isArray(entry) || typeof entry[0] !== "string" || !entry[1] || typeof entry[1] !== "object") continue;
        const level = cleanText(entry[0]);
        if (!level || level !== entry[0]) continue;
        const custom = {};
        if (isHexColor(entry[1].level)) custom.level = entry[1].level.toLowerCase();
        if (isHexColor(entry[1].name)) custom.name = entry[1].name.toLowerCase();
        if (custom.level || custom.name) settings.levels.set(level, custom);
      }
    }
  } catch {
    // Storage may be blocked or corrupted; defaults keep the page usable.
  }
  return settings;
}

function writeStoredColors() {
  try {
    const levels = [...colorSettings.levels.entries()].slice(-MAX_STORED_LEVELS);
    const payload = { title: colorSettings.title, name: colorSettings.name, levels };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable (private mode, quota); settings stay in memory.
  }
}

function updateLevelColor(level, key, value) {
  if (!isHexColor(value)) return;
  const custom = { ...colorSettings.levels.get(level), [key]: value.toLowerCase() };
  colorSettings.levels.delete(level);
  colorSettings.levels.set(level, custom);
  writeStoredColors();
  updateOutput();
}

function createColorInput(labelText, value, onInput) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  label.append(labelText, " ", input);
  return { label, input };
}

function renderLevelColors() {
  if (!groups) {
    elements.levelColors.replaceChildren();
    elements.levelColors.hidden = true;
    return;
  }
  const rows = groups.map(({ level }) => {
    const custom = colorSettings.levels.get(level) ?? {};
    const row = document.createElement("div");
    row.className = "level-row";
    const name = document.createElement("span");
    name.className = "level-name";
    name.textContent = level;
    name.title = level;
    const levelInput = createColorInput("Seviye adı", custom.level ?? DEFAULT_COLORS.level, (value) =>
      updateLevelColor(level, "level", value),
    );
    const nameInput = createColorInput("İsimler", custom.name ?? colorSettings.name, (value) =>
      updateLevelColor(level, "name", value),
    );
    nameInput.input.dataset.level = level;
    row.append(name, levelInput.label, nameInput.label);
    return row;
  });
  elements.levelColors.replaceChildren(...rows);
  elements.levelColors.hidden = false;
}

function syncDefaultNameInputs() {
  for (const input of elements.levelColors.querySelectorAll("input[data-level]")) {
    if (!colorSettings.levels.get(input.dataset.level)?.name) input.value = colorSettings.name;
  }
}

function showStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function createTextNode(item, originX, originY, width, height) {
  const node = document.createElement("span");
  node.className = `item ${item.kind}`;
  node.textContent = item.text;
  node.style.left = `${((item.x - originX) / width) * 100}%`;
  node.style.top = `${((item.y - originY) / height) * 100}%`;
  node.style.fontSize = `${item.size * 100}cqw`;
  node.style.color = item.color;
  return node;
}

function renderPreview({ items }) {
  elements.preview.replaceChildren(
    ...items.map((item) => {
      if (!item.scroll) return createTextNode(item, 0, 0, 1, 1);
      const { clip } = item.scroll;
      const box = document.createElement("div");
      box.className = "clip";
      box.style.left = `${clip.x * 100}%`;
      box.style.top = `${clip.y * 100}%`;
      box.style.width = `${clip.width * 100}%`;
      box.style.height = `${clip.height * 100}%`;
      const node = createTextNode(item, clip.x, clip.y, clip.width, clip.height);
      node.classList.add("top-anchored");
      node.style.top = "0";
      box.append(node);
      return box;
    }),
  );
}

function describeScroll(layout) {
  if (!layout.scrollingCount) return "";
  const seconds = Number(elements.seconds.value);
  const warning = seconds < layout.minSeconds ? " Şu anki süre daha kısa; akış okunamayacak kadar hızlı olabilir." : "";
  return ` ${layout.scrollingCount} sütun akıyor; en uzun sütunun okunabilmesi için en az ${layout.minSeconds} sn önerilir.${warning}`;
}

function updateOutput() {
  settingOutput = null;
  elements.downloadSetting.disabled = true;
  if (!groups) return;
  elements.downloadText.disabled = false;
  try {
    const layout = computeLayout(groups, { title: elements.title.value, colors: colorSettings });
    settingOutput = generateSetting(layout, {
      font: elements.font.value,
      seconds: elements.seconds.value,
      framesPerSecond: elements.fps.value,
    });
    renderPreview(layout);
    elements.downloadSetting.disabled = false;
    const total = groups.reduce((sum, group) => sum + group.members.length, 0);
    showStatus(
      `${total} üye, ${groups.length} seviye hazır. MediaOut'a bağlanacak node: ${getOutputNodeName(layout)}.${describeScroll(layout)}`,
    );
  } catch (error) {
    elements.preview.replaceChildren();
    showStatus(error.message, true);
  }
}

async function loadFile(file) {
  groups = null;
  settingOutput = null;
  elements.preview.replaceChildren();
  elements.downloadSetting.disabled = true;
  elements.downloadText.disabled = true;
  try {
    if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Sadece .csv dosyası kabul edilir.");
    if (file.size > MAX_FILE_BYTES) throw new Error("Dosya 5 MB'tan büyük.");
    groups = buildGroups(await file.text());
    renderLevelColors();
    updateOutput();
  } catch (error) {
    renderLevelColors();
    showStatus(error.message, true);
  }
}

function saveFile(content, fileName) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

elements.titleColor.value = colorSettings.title;
elements.nameColor.value = colorSettings.name;

elements.fileInput.addEventListener("change", () => {
  if (elements.fileInput.files[0]) loadFile(elements.fileInput.files[0]);
});
elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("active");
});
elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("active"));
elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("active");
  if (event.dataTransfer.files[0]) loadFile(event.dataTransfer.files[0]);
});
for (const input of [elements.title, elements.font, elements.seconds, elements.fps]) {
  input.addEventListener("input", updateOutput);
}
elements.titleColor.addEventListener("input", () => {
  colorSettings.title = pickColor(elements.titleColor.value, DEFAULT_COLORS.title);
  writeStoredColors();
  updateOutput();
});
elements.nameColor.addEventListener("input", () => {
  colorSettings.name = pickColor(elements.nameColor.value, DEFAULT_COLORS.name);
  syncDefaultNameInputs();
  writeStoredColors();
  updateOutput();
});
elements.resetColors.addEventListener("click", () => {
  colorSettings.title = DEFAULT_COLORS.title;
  colorSettings.name = DEFAULT_COLORS.name;
  colorSettings.levels.clear();
  elements.titleColor.value = colorSettings.title;
  elements.nameColor.value = colorSettings.name;
  writeStoredColors();
  renderLevelColors();
  updateOutput();
});
elements.downloadSetting.addEventListener("click", () => {
  if (settingOutput) saveFile(settingOutput, "uye-karti.setting");
});
elements.downloadText.addEventListener("click", () => {
  if (groups) saveFile(formatPlainText(groups), "uyeler.txt");
});
