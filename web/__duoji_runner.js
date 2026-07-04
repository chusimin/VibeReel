// Bootstrap: register sucrase + patch @/ alias to project root.
const Module = require("module");
const path = require("path");

const ROOT = __dirname;
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (typeof request === "string" && request.startsWith("@/")) {
    const rel = request.slice(2);
    return origResolve.call(this, path.join(ROOT, rel), parent, ...rest);
  }
  return origResolve.call(this, request, parent, ...rest);
};

require("sucrase/register");
require(path.join(ROOT, "__duoji_e2e.ts"));
