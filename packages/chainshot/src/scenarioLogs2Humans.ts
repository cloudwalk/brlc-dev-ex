import path from "node:path";
import fs from "node:fs/promises";
import type { Scenario } from "./Scenario.js";
import Handlebars from "handlebars";
import { strigifyLogArgumentsVerbose, stringifyInline, stringifyMultiline } from "./utils.js";
import { renderSequenceDiagram } from "./sequenceDiagram.js";

async function getFileName(testFile: string) {
  const parsed = path.parse(testFile);
  const snapshotsDir = path.join(parsed.dir, "__snapshots__humans__");
  await fs.mkdir(snapshotsDir, { recursive: true });
  return path.join(snapshotsDir, parsed.name + ".md");
}

Handlebars.registerHelper("stringify-inline", stringifyInline);
Handlebars.registerHelper("stringify-multiline", stringifyMultiline);
Handlebars.registerHelper("strigifyLogArgumentsVerbose", strigifyLogArgumentsVerbose);
Handlebars.registerHelper("mermaid", renderSequenceDiagram);
Handlebars.registerHelper("inc", function (value: string) {
  return parseInt(value) + 1;
});
async function getDumpMDFileContent(testFile: string, scenarios: Scenario[]) {
  const template = await fs.readFile(path.resolve(__dirname, "./templates/humanSnapshot.md.hbs"), "utf8")
    .then(t => Handlebars.compile(t));

  return template({
    testTitle: path.parse(testFile).name,
    scenarios,
  });
}
export async function dumpScenariosToHumans(testFile: string, scenarios: Scenario[]) {
  const dumpFile = await getFileName(testFile);
  const dumpFileContent = await getDumpMDFileContent(testFile, scenarios);
  await fs.writeFile(dumpFile, dumpFileContent);
}
