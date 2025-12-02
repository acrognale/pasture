import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import noBarrelFiles from "eslint-plugin-no-barrel-files";
import react from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import reactHooks from "eslint-plugin-react-hooks";
import storybookPlugin from "eslint-plugin-storybook";
import tseslint from "typescript-eslint";

const commonIgnores = [
  "node_modules/**",
  "dist/**",
  "coverage/**",
  "**/eslint.config.js",
];

const extensionlessRestriction = {
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
};

const baseTypeScriptRules = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
    },
  ],
  "import/namespace": "off",
  "@typescript-eslint/no-namespace": "off",
  "no-restricted-imports": ["error", extensionlessRestriction],
};

const noBarrelRule = { "no-barrel-files/no-barrel-files": "error" };

const normalizeProject = (project = ["./tsconfig.json"]) =>
  Array.isArray(project) ? project : [project];

const withTypeScriptConfigs = ({ files, tsconfigRootDir, project, typeChecked }) => {
  const base = typeChecked
    ? tseslint.configs.recommendedTypeChecked
    : tseslint.configs.recommended;

  return base.map((config) => ({
    ...config,
    files,
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        ...(typeChecked
          ? { project: normalizeProject(project), tsconfigRootDir }
          : { tsconfigRootDir }),
      },
    },
  }));
};

const createTypeScriptConfig = ({
  files,
  tsconfigRootDir,
  project,
  enforceNoBarrel,
  typeChecked,
  extraRules = {},
}) => ({
  files,
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ...(typeChecked
        ? { project: normalizeProject(project), tsconfigRootDir }
        : { tsconfigRootDir }),
    },
  },
  plugins: {
    "@typescript-eslint": tseslint.plugin,
    import: importPlugin,
    "no-barrel-files": noBarrelFiles,
  },
  settings: {
    "import/resolver": {
      typescript: {
        project: true,
        tsconfigRootDir,
      },
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    },
  },
  rules: {
    ...baseTypeScriptRules,
    ...(enforceNoBarrel ? noBarrelRule : {}),
    ...extraRules,
  },
});

const createReactConfig = ({
  files,
  tsconfigRootDir,
  project,
  enforceNoBarrel,
  typeChecked,
  extraRules = {},
}) => ({
  files,
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ...(typeChecked
        ? { project: normalizeProject(project), tsconfigRootDir }
        : { tsconfigRootDir }),
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
    react,
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
        tsconfigRootDir,
      },
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    },
  },
  rules: {
    ...baseTypeScriptRules,
    ...(enforceNoBarrel ? noBarrelRule : {}),
    ...react.configs.flat.recommended.rules,
    ...reactHooks.configs.flat.recommended.rules,
    ...reactCompiler.configs.recommended.rules,
    "react/react-in-jsx-scope": "off",
    "react/jsx-uses-react": "off",
    "react/no-unescaped-entities": "off",
    ...extraRules,
  },
});

const applyStorybookIfEnabled = (storybook) =>
  storybook
    ? storybookPlugin.configs["flat/recommended"].map((config) => ({
        ...config,
        files:
          config.files ?? ["**/*.stories.@(ts|tsx|js|jsx|mjs|cjs)", "**/*.story.@(ts|tsx|js|jsx|mjs|cjs)"],
      }))
    : [];

export function reactApp({
  tsconfigRootDir = import.meta.dirname,
  ignores = [],
  storybook = false,
  files = ["**/*.{js,mjs,cjs,ts,tsx,jsx}"],
  project = "./tsconfig.json",
  noBarrel = true,
  typeChecked = true,
  rules,
} = {}) {
  const tsFiles = ["**/*.ts", "**/*.tsx"];

  return tseslint.config(
    { ignores: [...commonIgnores, ...ignores] },
    {
      files,
      ...eslint.configs.recommended,
    },
    ...withTypeScriptConfigs({
      files: tsFiles,
      tsconfigRootDir,
      project,
      typeChecked,
    }),
    createReactConfig({
      files: [...tsFiles, "**/*.js", "**/*.jsx"],
      tsconfigRootDir,
      project,
      enforceNoBarrel: noBarrel,
      typeChecked,
      extraRules: rules,
    }),
    ...applyStorybookIfEnabled(storybook)
  );
}

export function reactLibrary(options = {}) {
  return reactApp({ ...options, storybook: false, noBarrel: false });
}

export function tsLibrary({
  tsconfigRootDir = import.meta.dirname,
  ignores = [],
  files = ["**/*.{js,mjs,cjs,ts}"],
  project = "./tsconfig.json",
  typeChecked = true,
  rules,
} = {}) {
  const tsFiles = ["**/*.ts", "**/*.tsx"];

  return tseslint.config(
    { ignores: [...commonIgnores, ...ignores] },
    {
      files,
      ...eslint.configs.recommended,
    },
    ...withTypeScriptConfigs({
      files: tsFiles,
      tsconfigRootDir,
      project,
      typeChecked,
    }),
    createTypeScriptConfig({
      files: tsFiles,
      tsconfigRootDir,
      project,
      enforceNoBarrel: false,
      typeChecked,
      extraRules: rules,
    })
  );
}

export default {
  reactApp,
  reactLibrary,
  tsLibrary,
};
