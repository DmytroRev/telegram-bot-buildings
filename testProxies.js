import { testProxy } from "./parser.js";

async function main() {
  for (const proxy of [
    "http://134.209.29.120:80",
  ]) {
    await testProxy(proxy);
  }
}

main();
