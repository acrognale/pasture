import {
  type ModelProviderId,
  inferModelProviderId,
} from '~/lib/providerInference';

import { MODEL_OPTIONS, type ModelName } from './model-options';

export const PROVIDER_DISPLAY_NAMES: Record<ModelProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export const MODELS_BY_PROVIDER = (() => {
  const openaiModels: ModelName[] = [];
  const anthropicModels: ModelName[] = [];
  for (const model of MODEL_OPTIONS) {
    const provider = inferModelProviderId(model);
    if (provider === 'anthropic') {
      anthropicModels.push(model);
    } else {
      openaiModels.push(model);
    }
  }
  return { openaiModels, anthropicModels };
})();
