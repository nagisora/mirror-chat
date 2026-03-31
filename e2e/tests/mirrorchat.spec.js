/**
 * MirrorChat Chrome 拡張機能 E2E テスト
 *
 * 実行前に各AIサービス（ChatGPT, Claude, Gemini, Grok）にログイン済みの
 * Chrome プロファイルを使うと、送信〜回答取得までフルにテストできます。
 *
 * ログイン済みプロファイルを使う場合:
 *   MIRRORCHAT_USER_DATA_DIR=/path/to/chrome/profile pnpm test
 *
 * 未ログインの場合は「サイトを開く」「ポップアップ表示」などの基本動作のみ検証します。
 */
const { test, expect } = require("../fixtures");

test.describe("MirrorChat 拡張機能", () => {
  test("ポップアップが表示され、タイトルが正しい", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);
    await expect(page.locator("h1")).toHaveText("MirrorChat");
    await expect(page.locator("#prompt-input")).toBeVisible();
    await expect(page.locator("#open-tabs-button")).toBeVisible();
    await expect(page.locator("#collect-button")).toBeVisible();
    await expect(page.locator("#resave-button")).toBeVisible();
    await expect(page.locator("#regenerate-digest-button")).toBeVisible();
    await expect(page.locator("#digest-model-select")).toBeVisible();
    await expect(page.locator("#digest-status")).toBeVisible();
    const aiCheckboxes = page.locator(".ai-checkbox");
    await expect(aiCheckboxes).toHaveCount(4);
    await expect(aiCheckboxes.nth(0)).toBeChecked();
    await expect(aiCheckboxes.nth(1)).toBeChecked();
    await expect(aiCheckboxes.nth(2)).toBeChecked();
    await expect(aiCheckboxes.nth(3)).toBeChecked();
  });

  test("使用するAIを全て外すとサイトを開けない", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    const checkboxes = page.locator(".ai-checkbox");
    for (let i = 0; i < 4; i++) {
      await checkboxes.nth(i).uncheck();
    }

    await page.locator("#open-tabs-button").click();
    await expect(page.locator("#status")).toContainText("1つ以上選択", {
      timeout: 5_000,
    });
  });

  test("「サイトを開く」で4つのAIタブが開く", async ({ context, page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    const openTabsBtn = page.locator("#open-tabs-button");
    await openTabsBtn.click();

    await expect(page.locator("#status")).toContainText(/開きました|開いています/, {
      timeout: 15_000,
    });

    // 送信ボタンが有効＝拡張機能が4つのタブを開いたと認識している
    await expect(page.locator("#send-button")).toBeEnabled({ timeout: 5_000 });
  });

  test("タブが開くまで送信ボタンは無効", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);
    await expect(page.locator("#send-button")).toBeDisabled();
  });

  test("回答取得ボタンの状態がフローに応じて変化する", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);
    // 前のテストの残留状態をクリアして初期状態を保証（タブ閉じ＋storage クリア）
    await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "MIRRORCHAT_CLOSE_TABS" }, () => {
          chrome.storage.local.remove(
            ["mirrorchatCurrentTask", "mirrorchatFailedItems"],
            resolve
          );
        });
      });
    });
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    const openTabsBtn = page.locator("#open-tabs-button");
    const sendBtn = page.locator("#send-button");
    const collectBtn = page.locator("#collect-button");
    const status = page.locator("#status");

    // 初期状態: タブ未オープンなので送信・回答取得ボタンは無効
    await expect(sendBtn).toBeDisabled();
    await expect(collectBtn).toBeDisabled();

    // タブを開くと送信ボタンだけ有効になる
    await openTabsBtn.click();
    await expect(status).toContainText(/開きました|開いています/, { timeout: 15_000 });
    await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
    await expect(collectBtn).toBeDisabled();

    // 質問送信後は送信ボタンが無効になり、回答取得ボタンが有効になる
    await page.locator("#prompt-input").fill("E2Eテスト: 1+1は？");
    await sendBtn.click();
    await expect(status).toContainText(/送信が完了しました|送信中/, { timeout: 10_000 });
    await expect(sendBtn).toBeDisabled();
    await expect(collectBtn).toBeEnabled();
  });

  test("設定ページが表示される", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.locator("h1")).toHaveText("MirrorChat 設定");
    await expect(page.locator("#obsidian-base-url")).toBeVisible();
    await expect(page.locator("#openrouter-enable-digest")).toBeVisible();
    await expect(page.locator("#openrouter-api-key")).toBeVisible();
  });

  test("設定ページで各AIのコピーボタンセレクタが表示される", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // 各AIの設定セクションにコピーボタンセレクタ入力欄があること
    const aiConfigs = page.locator(".ai-config");
    const count = await aiConfigs.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      await expect(aiConfigs.nth(i).locator(".copy-selector")).toBeVisible();
    }
  });

  test("質問入力して送信ボタンを押すと送信が開始される", async ({
    context,
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    const openTabsBtn = page.locator("#open-tabs-button");
    await openTabsBtn.click();
    await expect(page.locator("#status")).toContainText(/開きました|開いています/, {
      timeout: 15_000,
    });

    const promptInput = page.locator("#prompt-input");
    await promptInput.fill("1+1は？");
    const sendBtn = page.locator("#send-button");
    await sendBtn.click();

    await expect(page.locator("#status")).toContainText(/送信|開始/, {
      timeout: 5_000,
    });
  });

  test("サイトを開いた後にサイトを閉じるボタンが動作する", async ({
    context,
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    // タブを開く
    await page.locator("#open-tabs-button").click();
    await expect(page.locator("#status")).toContainText(/開きました|開いています/, {
      timeout: 15_000,
    });
    await expect(page.locator("#close-tabs-button")).toBeEnabled({ timeout: 5_000 });

    // タブを閉じる
    await page.locator("#close-tabs-button").click();
    await expect(page.locator("#status")).toContainText(/閉じました/, {
      timeout: 5_000,
    });

    // 送信ボタンが無効に戻る
    await expect(page.locator("#send-button")).toBeDisabled({ timeout: 5_000 });
  });

  test("設定を保存・復元できる", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // テスト用のURLを入力
    const baseUrlInput = page.locator("#obsidian-base-url");
    await baseUrlInput.fill("http://127.0.0.1:27124/");

    const rootPathInput = page.locator("#obsidian-root-path");
    await rootPathInput.fill("TestPath");

    // 保存
    await page.locator("#save-button").click();
    await expect(page.locator("#status")).toContainText("保存しました", {
      timeout: 5_000,
    });

    // ページをリロードして復元を確認
    await page.reload();
    await expect(baseUrlInput).toHaveValue("http://127.0.0.1:27124/", {
      timeout: 5_000,
    });
    await expect(rootPathInput).toHaveValue("TestPath", {
      timeout: 5_000,
    });
  });

  test("OpenRouter digest 設定を保存・復元できる", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.locator("#openrouter-enable-digest").check();
    await page.locator("#openrouter-api-key").fill("sk-or-test");
    await page.locator("details.advanced-settings").nth(0).locator("summary").click();
    await page.locator("#openrouter-preferred-model").selectOption("google/gemma-3-27b-it:free");

    await page.locator("#save-button").click();
    await expect(page.locator("#status")).toContainText("保存しました", {
      timeout: 5_000,
    });

    await page.reload();

    await expect(page.locator("#openrouter-enable-digest")).toBeChecked();
    await expect(page.locator("#openrouter-api-key")).toHaveValue("sk-or-test");
    await page.locator("details.advanced-settings").nth(0).locator("summary").click();
    await expect(page.locator("#openrouter-preferred-model")).toHaveValue("google/gemma-3-27b-it:free");
  });

  test("直近ノートがあれば再保存と digest再生成を実行できる", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.sync.set(
          {
            mirrorchatSettings: {
              openrouter: {
                preferredModel: "",
                freeModelCandidatesOverride: [
                  "google/gemma-3-27b-it:free",
                  "meta-llama/llama-3.3-70b-instruct:free"
                ]
              }
            }
          },
          () => {
            chrome.storage.local.set(
              {
                mirrorchatLastNoteSnapshot: {
                  question: "テスト質問",
                  results: [{ name: "ChatGPT", markdown: "テスト回答" }],
                  notePath: "Test/01-test.md"
                }
              },
              resolve
            );
          }
        );
      });
    });

    await page.reload();

    await expect(page.locator("#resave-button")).toBeEnabled();
    await expect(page.locator("#regenerate-digest-button")).toBeEnabled();
    await expect(page.locator("#digest-model-select")).toHaveValue("");
    await expect(page.locator("#digest-model-select option")).toHaveCount(3);
  });

  test("高度なAI設定を保存・復元できる", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const chatgpt = page.locator(".ai-config[data-ai='chatgpt']");
    const claude = page.locator(".ai-config[data-ai='claude']");

    await chatgpt.locator("details.advanced-settings > summary").click();
    await claude.locator("details.advanced-settings > summary").click();

    await chatgpt.locator(".done-selector").fill("button[data-testid='stop-button'], button[aria-label='Stop']");
    await chatgpt.locator(".submit-method-selector").selectOption("pressEnterToSubmit");
    await claude.locator(".input-success-fallback-selector").fill("chatgpt");

    await page.locator("#save-button").click();
    await expect(page.locator("#status")).toContainText("保存しました", {
      timeout: 5_000,
    });

    await page.reload();

    await chatgpt.locator("details.advanced-settings > summary").click();
    await claude.locator("details.advanced-settings > summary").click();

    await expect(chatgpt.locator(".done-selector")).toHaveValue("button[data-testid='stop-button'], button[aria-label='Stop']");
    await expect(chatgpt.locator(".submit-method-selector")).toHaveValue("pressEnterToSubmit");
    await expect(claude.locator(".input-success-fallback-selector")).toHaveValue("chatgpt");
  });

  test("質問が空の場合にエラーメッセージが表示される", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    // タブを開く（送信ボタンを有効にするため）
    await page.locator("#open-tabs-button").click();
    await expect(page.locator("#send-button")).toBeEnabled({ timeout: 15_000 });

    // 入力欄を明示的に空にしてから送信（前のテストの残留を防ぐ）
    await page.locator("#prompt-input").fill("");
    await page.locator("#send-button").click();

    await expect(page.locator("#status")).toContainText("入力してください", {
      timeout: 5_000,
    });
  });

  test("各AIインジケータが初期状態で表示される", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    const aiKeys = ["chatgpt", "claude", "gemini", "grok"];
    for (const key of aiKeys) {
      await expect(page.locator(`#ind-${key}`)).toBeVisible();
    }
  });

  test("タブを開くとインジケータがopen状態になる", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);
    await page.locator("#open-tabs-button").click();
    await expect(page.locator("#status")).toContainText(/開きました|開いています/, {
      timeout: 15_000,
    });

    // 少なくとも1つのインジケータがopen状態になっているか
    const aiKeys = ["chatgpt", "claude", "gemini", "grok"];
    let hasOpen = false;
    for (const key of aiKeys) {
      const classList = await page.locator(`#ind-${key}`).getAttribute("class");
      if (classList && classList.includes("open")) {
        hasOpen = true;
        break;
      }
    }
    expect(hasOpen).toBe(true);
  });

  test("既存の会話に続けて送信のチェックボックスが表示される", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    const followUpCheckbox = page.locator("#follow-up-checkbox");
    await expect(followUpCheckbox).toBeVisible();
    await expect(page.locator("label.checkbox-row")).toContainText("既存の会話に続けて送信");

    // チェックボックスは初期状態で未チェック
    await expect(followUpCheckbox).not.toBeChecked();
  });

  test("ポップアップ再表示時にタブ状態が復帰する", async ({ context, page, extensionId }) => {
    // 前のテストの残留状態をクリア（CURRENT_TASK があると hasPendingQuestion で送信ボタンが無効になる）
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);
    await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "MIRRORCHAT_CLOSE_TABS" }, () => {
          chrome.storage.local.remove(
            ["mirrorchatCurrentTask", "mirrorchatFailedItems"],
            resolve
          );
        });
      });
    });
    // タブを開く
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);
    await page.locator("#open-tabs-button").click();
    await expect(page.locator("#send-button")).toBeEnabled({ timeout: 15_000 });

    // ポップアップを再度開く（ページを再ナビゲート）
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);

    // タブ状態が復帰して送信ボタンが有効であること
    await expect(page.locator("#send-button")).toBeEnabled({ timeout: 10_000 });
  });

  test("未取得タスクがあっても起動時に入力欄はクリアされる", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);
    await page.locator("#open-tabs-button").click();
    await expect(page.locator("#send-button")).toBeEnabled({ timeout: 15_000 });

    await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.local.set(
          {
            mirrorchatCurrentTask: {
              prompt: "前回の質問テキスト",
              createdAt: Date.now(),
              isFollowUp: true,
              enabledAIs: ["chatgpt", "claude"]
            }
          },
          resolve
        );
      });
    });

    await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);
    await expect(page.locator("#prompt-input")).toHaveValue("");
    await expect(page.locator("#follow-up-checkbox")).not.toBeChecked();
    await expect(page.locator("#status")).toContainText("前回の質問の回答が未取得", {
      timeout: 5_000,
    });
    await expect(page.locator("#collect-button")).toBeEnabled({ timeout: 5_000 });
  });
});
