(function () {
  const { STORAGE_KEYS } = self.MirrorChatConstants;
  const CURRENT_TASK_KEY = STORAGE_KEYS.CURRENT_TASK;

  function getCurrentTask() {
    return new Promise((resolve) => {
      chrome.storage.local.get(CURRENT_TASK_KEY, (data) => {
        resolve(data?.[CURRENT_TASK_KEY] || null);
      });
    });
  }

  function setCurrentTask(task) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [CURRENT_TASK_KEY]: task }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(task);
      });
    });
  }

  function clearCurrentTask() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(CURRENT_TASK_KEY, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  self.MirrorChatCurrentTaskManager = {
    getCurrentTask,
    setCurrentTask,
    clearCurrentTask
  };
})();