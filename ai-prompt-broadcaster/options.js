document.addEventListener("DOMContentLoaded", async () => {
  const baseUrlInput = document.getElementById("obsidian-base-url");
  const tokenInput = document.getElementById("obsidian-token");
  const rootPathInput = document.getElementById("obsidian-root-path");
  const saveButton = document.getElementById("save-button");
  const status = document.getElementById("status");

  const storage = window.MirrorChatStorage;

  async function restore() {
    const settings = await storage.getSettings();

    baseUrlInput.value = settings.obsidian.baseUrl || "";
    tokenInput.value = settings.obsidian.token || "";
    rootPathInput.value = settings.obsidian.rootPath || "";

    document
      .querySelectorAll(".ai-config")
      .forEach((container) => {
        const aiKey = container.getAttribute("data-ai");
        const cfg = (settings.aiConfigs && settings.aiConfigs[aiKey]) || {};
        container.querySelector(".input-selector").value = cfg.inputSelector || "";
        container.querySelector(".submit-selector").value = cfg.submitButtonSelector || "";
        container.querySelector(".answer-selector").value = cfg.answerContainerSelector || "";
        const copyEl = container.querySelector(".copy-selector");
        if (copyEl) copyEl.value = cfg.copyButtonSelector || "";
      });
  }

  async function save() {
    const partial = {
      obsidian: {
        baseUrl: baseUrlInput.value.trim(),
        token: tokenInput.value.trim(),
        rootPath: rootPathInput.value.trim()
      },
      aiConfigs: {}
    };

    document
      .querySelectorAll(".ai-config")
      .forEach((container) => {
        const aiKey = container.getAttribute("data-ai");
        const config = {
          inputSelector: container.querySelector(".input-selector").value.trim(),
          submitButtonSelector: container.querySelector(".submit-selector").value.trim(),
          answerContainerSelector: container.querySelector(".answer-selector").value.trim()
        };
        const copyVal = (container.querySelector(".copy-selector")?.value || "").trim();
        if (copyVal) config.copyButtonSelector = copyVal;
        partial.aiConfigs[aiKey] = config;
      });

    await storage.saveSettings(partial);
    status.textContent = "保存しました。";
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  }

  saveButton.addEventListener("click", () => {
    save().catch((err) => {
      console.error(err);
      status.textContent = "保存に失敗しました。コンソールを確認してください。";
    });
  });

  restore().catch((err) => {
    console.error(err);
    status.textContent = "設定の読み込みに失敗しました。コンソールを確認してください。";
  });

  document.getElementById("retry-button").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "MIRRORCHAT_RETRY" });
    status.textContent = "再送信を開始しました。";
    setTimeout(() => { status.textContent = ""; }, 3000);
  });
});

