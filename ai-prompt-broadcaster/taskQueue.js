(function () {
  const queue = [];
  let processing = false;

  function enqueue(task) {
    queue.push(task);
  }

  function dequeue() {
    return queue.shift();
  }

  function isEmpty() {
    return queue.length === 0;
  }

  function isProcessing() {
    return processing;
  }

  function setProcessing(nextProcessing) {
    processing = !!nextProcessing;
  }

  self.MirrorChatTaskQueue = {
    enqueue,
    dequeue,
    isEmpty,
    isProcessing,
    setProcessing
  };
})();