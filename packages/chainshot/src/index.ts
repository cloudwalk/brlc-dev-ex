/* eslint-disable @typescript-eslint/no-namespace */

import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { RootHookObject } from "mocha";
import { expect, assert, use as chaiUse } from "chai";
import { Scenario, ScenarioConfig } from "./Scenario.js";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";
import { dumpScenariosToHumans } from "./scenarioLogs2Humans.js";

type FirstFunctionArgument<T> = T extends (arg: infer A) => unknown ? A : never;

export function mochaHooks(options: {
  hre?: HardhatRuntimeEnvironment;
  jestSnapshotPluginConfig?: FirstFunctionArgument<typeof jestSnapshotPlugin>;
} = {},
): RootHookObject {
  let currentTest: Mocha.Test | undefined;

  const scenariosCache = new Map<string, Scenario>();
  const scenariosToHumanSnapshots: Record<string, Scenario[]> = {};

  function initPlugin(hre: HardhatRuntimeEnvironment) {
    chaiUse(jestSnapshotPlugin(options.jestSnapshotPluginConfig));

    expect.startScenario = async function startScenario(config: ScenarioConfig): Promise<void> {
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
    };
    expect.endScenario = async function endScenario(this: Chai.ExpectStatic): Promise<void> {
      if (currentTest === undefined) {
        throw new Error("Scenario have to be completed in a test");
      }
      const scenario = scenariosCache.get(currentTest.id);
      if (scenario === undefined) {
        throw new Error("Scenario have to be started in a test");
      }
      scenario.restoreProvider(hre.ethers.provider);
      await scenario.processTxs();

      // scenario.printLogs();
      expect(scenario.logs).toMatchSnapshot();
      if (currentTest.file) {
        if (!scenariosToHumanSnapshots[currentTest.file]) {
          scenariosToHumanSnapshots[currentTest.file] = [];
        }
        scenariosToHumanSnapshots[currentTest.file].push(scenario);
      }
      scenariosCache.delete(currentTest.id);
    };
  }
  function initDummyPlugin() {
    async function dummy() {
      console.log("Current network is not hardhat, skipping scenario plugin");
    };
    expect.startScenario = dummy;
    expect.endScenario = dummy;
  }
  return {
    beforeAll(this: Mocha.Context) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const hre: HardhatRuntimeEnvironment = options.hre || require("hardhat");
      if (hre.network.name === "hardhat") {
        initPlugin(hre);
      } else {
        initDummyPlugin();
      }
    },
    beforeEach(this: Mocha.Context) {
      if (this.currentTest) {
        currentTest = this.currentTest;
      }
    },
    async afterAll() {
      // checking if all scenarios are ended
      assert(scenariosCache.size === 0, "There are still running snapshot scenarios");

      for (const [testFile, scenarios] of Object.entries(scenariosToHumanSnapshots)) {
        await dumpScenariosToHumans(testFile, scenarios);
      }
    },
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
