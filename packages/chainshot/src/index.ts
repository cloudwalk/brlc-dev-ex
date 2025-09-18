/* eslint-disable @typescript-eslint/no-namespace */

import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { beforeEach, after } from "mocha";
import { expect, assert, use as chaiUse } from "chai";
import { Scenario, ScenarioConfig } from "./Scenario.js";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";
import { dumpScenariosToHumans } from "./scenarioLogs2Humans.js";

type FirstFunctionArgument<T> = T extends (arg: infer A) => unknown ? A : never;
type ChaiPlugin = FirstFunctionArgument<typeof chaiUse>;

function chainShotChaiPlugin(
  hre: HardhatRuntimeEnvironment,
  jestSnapshotPluginConfig?: FirstFunctionArgument<typeof jestSnapshotPlugin>,
): ChaiPlugin {
  let currentTest: Mocha.Test | undefined;

  const scenariosCache = new Map<string, Scenario>();
  const scenariosToHumanSnapshots: Record<string, Scenario[]> = {};

  async function startScenario(this: Chai.ExpectStatic, config: ScenarioConfig): Promise<void> {
    console.log("startScenario", config);
    if (currentTest === undefined) {
      throw new Error("Scenario have to be runned in a test");
    }
    if (scenariosCache.has(currentTest.id)) {
      return; // scenariosCache.get(runnable.id) as Scenario;
    }
    const scenario: Scenario = new Scenario (
      hre,
      {
        test: currentTest,
        config,
        name: config.name,
      });

    scenario.injectIntoProvider(hre.ethers.provider);

    scenariosCache.set(currentTest.id, scenario);
    // return scenario;
  }

  async function endScenario(this: Chai.ExpectStatic): Promise<void> {
    if (currentTest === undefined) {
      throw new Error("Scenario have to be completed in a test");
    }
    const scenario = scenariosCache.get(currentTest.id);
    if (scenario === undefined) {
      throw new Error("Scenario have to be started in a test");
    }
    scenario.restoreProvider(hre.ethers.provider);
    scenario.printLogs();
    expect(scenario.logs).toMatchSnapshot();
    if (currentTest.file) {
      scenariosToHumanSnapshots[currentTest.file] = [...(scenariosToHumanSnapshots[currentTest.file] || []), scenario];
    }
    scenariosCache.delete(currentTest.id);
  }

  return function (chai) {
    chaiUse(jestSnapshotPlugin(jestSnapshotPluginConfig));

    beforeEach(function (this: Mocha.Context) {
      if (this.currentTest) {
        currentTest = this.currentTest;
      }
    });
    after(async function () {
      // checking if all scenarios are ended
      assert(scenariosCache.size === 0, "There are still running snapshot scenarios");

      for (const [testFile, scenarios] of Object.entries(scenariosToHumanSnapshots)) {
        await dumpScenariosToHumans(testFile, scenarios);
      }
    });
    if (hre.network.name === "hardhat") {
      // only for hardhat network rn
      chai.expect.startScenario = startScenario;
      chai.expect.endScenario = endScenario;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      async function dummy() {};
      chai.expect.startScenario = dummy;
      chai.expect.endScenario = dummy;
    }
  };
};

declare global {
  var scenario: (name: string, cb: () => Promise<void>) => void;
  namespace Chai {
    interface ExpectStatic {
      startScenario(
        config: ScenarioConfig,
      ): Promise<void>;
      endScenario(): Promise<void>;
    }
  }
}

export {
  chainShotChaiPlugin,
};
export default chainShotChaiPlugin;
