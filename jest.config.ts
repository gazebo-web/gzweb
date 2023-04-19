// Configre jest, which is used for testing.
import type { Config } from "@jest/types"

const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
};
export default config;
