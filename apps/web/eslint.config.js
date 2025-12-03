import { reactApp } from "@pasture/configs";

export default reactApp({
  tsconfigRootDir: import.meta.dirname,
  typeChecked: false,
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
  },
  ignores: ["dist/**", ".output/**"],
});
