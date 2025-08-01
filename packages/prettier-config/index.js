/**
 * @type {import("prettier").Config}
 */
const config = {
    "plugins": ["prettier-plugin-solidity"],
    "overrides": [
        {
        "files": "*.sol",
        "options": {
            "compiler": "0.8.24",
            "parser": "slang",
            "printWidth": 120,
            "tabWidth": 4,
            "semi": true,
            "useTabs": false,
            "singleQuote": false,
            "bracketSpacing": true
        }
        }
    ]
}

export default config;