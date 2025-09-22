import { RootHookObject } from "mocha";
import { mochaHooks as mochaHooksFn } from "./index.js";

export const mochaHooks: RootHookObject = mochaHooksFn();
