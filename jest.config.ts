import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testTimeout: 30000,
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node10",
          ignoreDeprecations: "6.0",
          jsx: "react-jsx",
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          paths: { "@/*": ["./src/*"] },
          rootDir: ".",
        },
      },
    ],
  },
  testPathIgnorePatterns: ["/node_modules/", "setup\\.ts$"],
};

export default config;
