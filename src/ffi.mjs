/**
 * Generate a psuedo-random id
 * @returns {string}
 */
function generateRandomId() {
  return Math.random().toString(36).substring(7);
}

/**
 * Get the project name, resolveDir and entry point from the projects gleam.toml file
 * @returns {Promise<{projectName: string, resolveDir: string, entry: string}>}
 */
async function getProjectInfo() {
  const projectConfig = await Deno.readTextFile("gleam.toml");
  const [_, projectName] = projectConfig.match(/name = "(.+)"/);
  const resolveDir = `./build/dev/javascript/${projectName}`;
  const entry = `${resolveDir}/gleam.main.mjs`;

  return {
    projectName,
    resolveDir,
    entry,
  };
}

/**
 * Find the source file that contains the given handler code
 * @param {string} resolveDir
 * @param {string} handlerCode
 * @throws {Error}
 * @returns {String}
 */
async function findHandlerSourceFile(resolveDir, handlerCode) {
  for await (const entry of Deno.readDir(resolveDir)) {
    if (entry.isDirectory) {
      const subFile = await findHandlerSourceFile(
        `${resolveDir}/${entry.name}`,
        handlerCode
      );
      if (subFile) {
        return subFile;
      }
    }
    if (entry.name.endsWith(".mjs")) {
      const file = await Deno.readTextFile(`${resolveDir}/${entry.name}`);
      if (file.includes(handlerCode)) {
        return entry.name;
      }
    }
  }
  throw new Error("Handler source file not found");
}

/**
 * Create a worker from a function and return the result wrapped in a promise
 * @param {() => any} handler
 * @returns {Promise<Worker>}
 */
export async function create(handler) {
  const { resolveDir } = await getProjectInfo();
  const handlerCode = handler.toString();
  const handlerId = `__${generateRandomId()}`;
  const handlerFile = await findHandlerSourceFile(resolveDir, handlerCode);
  const handlerSource = await Deno.readTextFile(`${resolveDir}/${handlerFile}`);

  const workerCode = `
  // bundled code
  ${handlerSource};
  // handler code should be wrapped in a onmessage event listener
  onmessage = (e) => {
      const messageId = e.data[0];
      const result = (${handlerCode})(e.data[1]);
      postMessage([messageId, result]);
  };`;

  const workerFile = `${handlerFile.replace(
    ".mjs",
    `.worker.${handlerId}.mjs`
  )}`;
  const workerPath = `${resolveDir}/${workerFile}`;

  await Deno.writeTextFile(workerPath, workerCode);

  globalThis.addEventListener("unload", () => {
    try {
      Deno.removeSync(workerPath);
    } catch (e) {}
  });

  const worker = new Worker(import.meta.resolve(`./${workerFile}`), {
    type: "module",
  });

  return worker;
}

/**
 * Send a message to a worker and return the result wrapped in a promise
 * @param {Worker} worker
 * @param {any} message
 * @returns {Promise<any>}
 */
export async function send(worker, message) {
  return new Promise((resolve, reject) => {
    const messageId = generateRandomId();

    const onMessage = (e) => {
      if (e.data[0] === messageId) {
        worker.removeEventListener("error", onError);
        worker.removeEventListener("message", onMessage);
        resolve(e.data[1]);
      }
    };

    const onError = (e) => {
      if (e.data[0] === messageId) {
        worker.removeEventListener("error", onError);
        worker.removeEventListener("message", onMessage);
        reject(e);
      }
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage([messageId, message]);
  });
}

/**
 * Terminate the worker
 * @param {Worker} worker
 */
export async function close(worker) {
  worker.terminate();
}
