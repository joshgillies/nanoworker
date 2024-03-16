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
 * TODO: this is a naive implementation, it should be improved
 * @param {string} resolveDir
 * @param {string} handlerCode
 * @returns {Promise<string[]>}
 */
async function findHandlerSourceFile(resolveDir, handlerCode) {
  const files = [];
  for await (const entry of Deno.readDir(resolveDir)) {
    if (entry.name.endsWith(".mjs")) {
      const file = await Deno.readTextFile(`${resolveDir}/${entry.name}`);
      if (file.includes(handlerCode)) {
        files.push(entry.name);
      }
    }
  }
  return files;
}

/**
 * Create a worker from a function and return the result wrapped in a promise
 * @param {() => any} handler
 * @returns {Promise<Worker>}
 */
export async function create(handler) {
  const { resolveDir } = await getProjectInfo();
  const handlerCode = handler.toString();
  const handlerId = `__${Math.random().toString(36).substring(7)}`;
  // TODO: what if the handler is not found, or there are many files with the same handler?|
  const [handlerFile] = await findHandlerSourceFile(resolveDir, handlerCode);
  const handlerSource = await Deno.readTextFile(`${resolveDir}/${handlerFile}`);

  const workerCode = `
  // bundled code
  ${handlerSource};
  // handler code should be wrapped in a onmessage event listener
  onmessage = (e) => {
      const result = (${handlerCode})(e.data);
      postMessage(result);
  };`;

  const workerFile = `${handlerFile.replace(
    ".mjs",
    `.worker.${handlerId}.mjs`
  )}`;
  const workerPath = `${resolveDir}/${workerFile}`;

  console.log(workerPath);
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
    worker.onmessage = (e) => {
      resolve(e.data);
    };
    worker.onerror = (e) => {
      reject(e);
    };
    worker.postMessage(message);
  });
}

/**
 * Terminate the worker
 * @param {Worker} worker
 */
export async function close(worker) {
  worker.terminate();
}
