/**
 * Load the esbuild module
 * @returns {Promise<any>}
 */
async function esbuild() {
  const esbuild = await import("https://deno.land/x/esbuild@v0.20.1/mod.js");
  return esbuild;
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
 * TODO: this is a naive implementation, it should be improved
 * @param {string} handlerCode
 * @returns {Promise<string[]>}
 */
async function findHandlerSourceFile(handlerCode) {
  const { resolveDir } = await getProjectInfo();
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
  const { build } = await esbuild();
  const handlerCode = handler.toString();
  const handlerId = `__${Math.random().toString(36).substring(7)}`;
  // TODO: what if the handler is not found, or there are many files with the same handler?|
  const [handlerFile] = await findHandlerSourceFile(handlerCode);
  const handlerSource = await Deno.readTextFile(`${resolveDir}/${handlerFile}`);
  // this code is used by esbuild to resolve as much of the handler scope as possible
  const contents = `${handlerSource};export const ${handlerId}=${handlerCode}`;
  // this is the global name that the handler will be available under
  const globalName = "nanoworker";

  let bundle = await build({
    stdin: {
      contents,
      resolveDir,
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "iife",
    globalName,
    target: "esnext",
  });

  const workerCode = `
  // bundled code
  ${bundle.outputFiles[0].text};
  // handler code should be wrapped in a onmessage event listener
  onmessage = (e) => {
      const result = ${globalName}.${handlerId}(e.data);
      postMessage(result);
  };`;

  const blob = new Blob([workerCode], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: "module" });
  const workerProxy = new Proxy(worker, {
    get: (target, prop, receiver) => {
      const value = target[prop];
      if (value instanceof Function) {
        if (prop === "terminate") {
          URL.revokeObjectURL(url);
        }
        return function (...args) {
          return value.apply(this === receiver ? target : this, args);
        };
      }
      return value;
    },
  });

  return workerProxy;
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
