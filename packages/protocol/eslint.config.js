import { tsLibrary } from '@pasture/configs';

export default tsLibrary({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['dist/**'],
});
