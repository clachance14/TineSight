import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Strict TypeScript rules
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      // Prevent 'any' type usage
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      // Require explicit return types on functions
      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowDirectConstAssertionInArrowFunctions: true,
      }],

      // Require explicit types on exported functions
      "@typescript-eslint/explicit-module-boundary-types": "error",

      // Prevent floating promises (unhandled async)
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Strict boolean expressions
      "@typescript-eslint/strict-boolean-expressions": ["error", {
        allowString: false,
        allowNumber: false,
        allowNullableObject: true,
        allowNullableBoolean: false,
        allowNullableString: false,
        allowNullableNumber: false,
        allowAny: false,
      }],

      // Prevent unused variables
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],

      // Require consistent type imports
      "@typescript-eslint/consistent-type-imports": ["error", {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
      }],

      // Prevent non-null assertions
      "@typescript-eslint/no-non-null-assertion": "error",

      // Require nullish coalescing over ||
      "@typescript-eslint/prefer-nullish-coalescing": "error",

      // Require optional chaining over && chains
      "@typescript-eslint/prefer-optional-chain": "error",

      // No unnecessary type assertions
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      // Prevent inferrable types being explicitly declared
      "@typescript-eslint/no-inferrable-types": "error",

      // Enforce array type style
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],

      // Prevent empty interfaces
      "@typescript-eslint/no-empty-interface": "error",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
