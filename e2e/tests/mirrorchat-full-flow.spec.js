/**
 * ログイン済み Chrome プロファイルが必要なフルフロー E2E
 *
 * 有効化: MIRRORCHAT_E2E_FULL=1（pnpm test:with-profile が自動で設定）
 *
 * 環境変数:
 * - MIRRORCHAT_E2E_AFTER_OPEN_WAIT_MS … タブオープン後、各AIページの読み込み待ち（既定 30000）
 * - MIRRORCHAT_E2E_POST_SEND_WAIT_MS … 送信完了から回答取得までの待ち（既定 180000）
 * - MIRRORCHAT_E2E_REQUIRE_OBSIDIAN … 1（既定）なら Obsidian 保存成功まで必須。0 なら4サイトとも取得 success（done）のみ検証
 *
 * 取得本文の検証: バックグラウンドの MIRRORCHAT_E2E_GET_LAST_RESULTS で直近の results を読み、各 AI の markdown に TESTOK が含まれることを確認する
 */
const { test, expect } = require("../fixtures");

const FULL = process.env.MIRRORCHAT_E2E_FULL === "1";
const num = (v, fallback) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const AFTER_OPEN_MS = num(process.env.MIRRORCHAT_E2E_AFTER_OPEN_WAIT_MS, 30_000);
const POST_SEND_MS = num(process.env.MIRRORCHAT_E2E_POST_SEND_WAIT_MS, 180_000);
const REQUIRE_OBSIDIAN = process.env.MIRRORCHAT_E2E_REQUIRE_OBSIDIAN !== "0";

const AI_KEYS = ["chatgpt", "claude", "gemini", "grok"];

async function resetMirrorChatState(page, extId) {
  await page.goto(`chrome-extension://${extId}/popup.html?standalone=1`);
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
}

test.describe("フルフロー（ログイン済みプロファイル）", () => {
  test.skip(!FULL, "MIRRORCHAT_E2E_FULL=1 のときのみ（pnpm test:with-profile 推奨）");

  test("送信後に回答を取得し、4サイトとも取得成功になる", async ({ page, extensionId }) => {
    // 各ステップの上限合計（既定の待ち時間）に余裕を持たせ、環境変数で待ちを延ばしても落ちないようにする
    const OPEN_TABS_TIMEOUT_MS = 60_000;
    const SEND_DONE_TIMEOUT_MS = 120_000;
    const FETCH_START_TIMEOUT_MS = 15_000;
    const POLL_TIMEOUT_MS = 600_000;
    const TAIL_BUFFER_MS = 240_000;
    test.setTimeout(
      OPEN_TABS_TIMEOUT_MS +
        SEND_DONE_TIMEOUT_MS +
        AFTER_OPEN_MS +
        POST_SEND_MS +
        FETCH_START_TIMEOUT_MS +
        POLL_TIMEOUT_MS +
        TAIL_BUFFER_MS
    );

    await test.step("状態をリセット", async () => {
      await resetMirrorChatState(page, extensionId);
      await page.goto(`chrome-extension://${extensionId}/popup.html?standalone=1`);
    });

    await test.step("AI サイトのタブを開く", async () => {
      await page.locator("#open-tabs-button").click();
      await expect(page.locator("#status")).toContainText(/開きました|開いています/, {
        timeout: OPEN_TABS_TIMEOUT_MS,
      });
      await expect(page.locator("#send-button")).toBeEnabled({ timeout: 15_000 });
    });

    await test.step("各タブの読み込み待ち", async () => {
      await page.waitForTimeout(AFTER_OPEN_MS);
    });

    await test.step("質問を送信", async () => {
      const prompt =
        "E2E test: reply with a single word TESTOK and nothing else. Do not add punctuation.";
      await page.locator("#prompt-input").fill(prompt);
      await page.locator("#send-button").click();
      await expect(page.locator("#status")).toContainText("送信が完了しました", {
        timeout: SEND_DONE_TIMEOUT_MS,
      });
      await expect(page.locator("#collect-button")).toBeEnabled();
    });

    await test.step("各AIの回答生成待ち", async () => {
      await page.waitForTimeout(POST_SEND_MS);
    });

    await test.step("回答を取得", async () => {
      await page.locator("#collect-button").click();
      await expect(page.locator("#status")).toContainText(/取得中|取得を開始|バックグラウンド/, {
        timeout: FETCH_START_TIMEOUT_MS,
      });
    });

    await test.step("4サイトとも取得フェーズが完了（インジケータ all done）", async () => {
      await expect
        .poll(
          async () => {
            for (const key of AI_KEYS) {
              const cls = (await page.locator(`#ind-${key}`).getAttribute("class")) || "";
              if (!/\bdone\b/.test(cls) || /\berror\b/.test(cls)) return false;
            }
            return true;
          },
          { timeout: POLL_TIMEOUT_MS, intervals: [500, 2000, 5000] }
        )
        .toBe(true);
    });

    await test.step("取得した本文にプロンプトで要求した応答（TESTOK）が含まれる", async () => {
      const pack = await page.evaluate(() => {
        return new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ type: "MIRRORCHAT_E2E_GET_LAST_RESULTS" }, (r) => {
              resolve({
                ok: r?.ok,
                results: r?.results,
                lastError: chrome.runtime.lastError?.message
              });
            });
          } catch (e) {
            resolve({ ok: false, error: String(e) });
          }
        });
      });
      expect(pack.lastError, "chrome.runtime.lastError").toBeFalsy();
      expect(pack.ok, "MIRRORCHAT_E2E_GET_LAST_RESULTS").toBe(true);
      expect(pack.results?.length, "results 件数").toBe(AI_KEYS.length);
      for (const r of pack.results) {
        expect(r.error, `${r.ai}: error`).toBeFalsy();
        expect(r.markdown || "", `${r.ai}: markdown に TESTOK`).toMatch(/TESTOK/i);
      }
    });

    await test.step("Obsidian まわりの最終ステータス", async () => {
      const terminalWaitMs = 120_000;
      if (REQUIRE_OBSIDIAN) {
        await expect(page.locator("#status")).toContainText(
          "回答の取得と Obsidian への保存が完了しました。",
          { timeout: terminalWaitMs }
        );
        await expect(page.locator("#collect-button")).toBeDisabled();
      } else {
        // 4サイト done でも本文が空の境界では「取得できませんでした」になり得るため許容する
        await expect(page.locator("#status")).toHaveText(
          /回答の取得と Obsidian への保存が完了しました。|Obsidian への保存に失敗しました|いずれのAIからも回答テキストを取得できませんでした/,
          { timeout: terminalWaitMs }
        );
      }
    });
  });
});
