import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import noBarrelFiles from "eslint-plugin-no-barrel-files";
import storybookPlugin from "eslint-plugin-storybook";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "node_modules/**",
      "apps/desktop/dist/**",
      "apps/desktop/src/components/ui/**",
      "apps/desktop/src/routeTree.gen.ts",
      "codex/**",
      "apps/desktop/src/codex.gen/**",
      "apps/desktop/src-tauri/**",
      "apps/desktop/.storybook/**",
    ],
  },

  // Base ESLint recommended rules for all files
  {
    files: ["apps/desktop/**/*.{js,mjs,cjs,ts,tsx}"],
    ...eslint.configs.recommended,
  },

  // TypeScript ESLint recommended rules (type-checked) for TypeScript files only
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["apps/desktop/**/*.ts", "apps/desktop/**/*.tsx"],
  })),

  // Custom configuration for TypeScript files
  {
    files: ["apps/desktop/**/*.ts", "apps/desktop/**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
        jsxRuntime: "automatic",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      import: importPlugin,
      "no-barrel-files": noBarrelFiles,
      storybook: storybookPlugin,
      react: react,
      "react-hooks": reactHooks,
      "react-compiler": reactCompiler,
    },
    settings: {
      react: {
        version: "detect",
      },
      "import/resolver": {
        typescript: {
          project: true,
          tsconfigRootDir: import.meta.dirname,
        },
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      ...reactCompiler.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
      "import/namespace": "off",
      "no-barrel-files/no-barrel-files": "error",
      "@typescript-eslint/no-namespace": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "./*.js",
                "./**/*.js",
                "../*.js",
                "../**/*.js",
                "~/*.js",
                "~/**/*.js",
                "./*.jsx",
                "./**/*.jsx",
                "../*.jsx",
                "../**/*.jsx",
                "~/*.jsx",
                "~/**/*.jsx",
              ],
              message:
                "Use extensionless import specifiers; bundler resolution handles the extension.",
            },
          ],
        },
      ],
    },
  },

  // Storybook recommended config
  ...storybookPlugin.configs["flat/recommended"]
);
