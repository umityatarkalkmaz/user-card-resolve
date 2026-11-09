// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Ümit Yatarkalkmaz

import {
  MAX_FILE_BYTES,
  buildGroups,
  computeLayout,
  formatPlainText,
  computeMinScrollSeconds,
  generateSetting,
  getOutputNodeName,
  isScrollLayout,
} from "./core.js";

const elements = {
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  title: document.querySelector("#title-input"),
  font: document.querySelector("#font-input"),
  seconds: document.querySelector("#seconds-input"),
  fps: document.querySelector("#fps-input"),
  status: document.querySelector("#status"),
  preview: document.querySelector("#preview"),
  downloadSetting: document.querySelector("#download-setting"),
  downloadText: document.querySelector("#download-text"),
};

let groups = null;
let settingOutput = null;

function showStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function renderPreview(items) {
  elements.preview.replaceChildren(
    ...items.map((item) => {
      const node = document.createElement("span");
      node.className = `item ${item.kind}`;
      node.textContent = item.text;
      node.style.left = `${item.x * 100}%`;
      node.style.top = `${item.y * 100}%`;
      node.style.fontSize = `${item.size * 100}cqw`;
      return node;
    }),
  );
}

function updateOutput() {
  settingOutput = null;
  elements.downloadSetting.disabled = true;
  if (!groups) return;
  elements.downloadText.disabled = false;
  try {
    const items = computeLayout(groups, elements.title.value);
    settingOutput = generateSetting(items, {
      font: elements.font.value,
      seconds: elements.seconds.value,
      framesPerSecond: elements.fps.value,
    });
    renderPreview(items);
    elements.downloadSetting.disabled = false;
    const total = groups.reduce((sum, group) => sum + group.members.length, 0);
    const scrollNote = isScrollLayout(items)
      ? ` Akan yazı; okunabilirlik için en az ${computeMinScrollSeconds(items)} sn önerilir.`
      : "";
    showStatus(`${total} üye, ${groups.length} seviye hazır. MediaOut'a bağlanacak node: ${getOutputNodeName(items)}.${scrollNote}`);
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
    updateOutput();
  } catch (error) {
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
elements.downloadSetting.addEventListener("click", () => {
  if (settingOutput) saveFile(settingOutput, "uye-karti.setting");
});
elements.downloadText.addEventListener("click", () => {
  if (groups) saveFile(formatPlainText(groups), "uyeler.txt");
});
