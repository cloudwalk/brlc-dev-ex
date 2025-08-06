/* eslint @typescript-eslint/no-require-imports: "off" */

const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint").default;
const stylistic = require("@stylistic/eslint-plugin");
const { globalIgnores } = require("eslint/config");
const pluginPromise = require("eslint-plugin-promise");
const globals = require("globals");

module.exports = tseslint.config(
  globalIgnores([
    `node_modules`,
    `dist`,
    `build`,
    `coverage`,
    `typechain-types`,
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  stylistic.configs.recommended,
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  pluginPromise.configs["flat/recommended"],
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": `warn`,
      "@stylistic/brace-style": [`warn`, `1tbs`, { allowSingleLine: true }],
      "@stylistic/indent-binary-ops": [`warn`, 2],
      "@stylistic/lines-around-comment": [
        `warn`,
        { beforeBlockComment: false },
      ],
      "@stylistic/max-len": [`error`, { code: 120, tabWidth: 2 }],
      "@stylistic/member-delimiter-style": [
        `warn`,
        {
          multiline: {
            delimiter: `semi`,
            requireLast: true,
          },
          singleline: {
            delimiter: `semi`,
            requireLast: false,
          },
        },
      ],
      "@stylistic/newline-per-chained-call": [
        `warn`,
        { ignoreChainWithDepth: 5 },
      ],
      "@stylistic/object-property-newline": [
        `warn`,
        { allowAllPropertiesOnSameLine: true },
      ],
      "@stylistic/operator-linebreak": [
        `warn`,
        `after`,
        { overrides: { "?": `before`, ":": `before` } },
      ],
      // discuss with team next rule
      "@stylistic/quotes": [
        `error`,
        `double`,
        { avoidEscape: true, allowTemplateLiterals: `always` },
      ],
      "@stylistic/semi": [`error`, `always`], // discuss with team
      "@stylistic/spaced-comment": [`warn`, `always`],
      "@stylistic/comma-dangle": [`warn`, `always-multiline`], // discuss with team
    },
  },
);
